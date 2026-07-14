import { createHash } from "node:crypto";

import { CuckooFilter } from "bloom-filters";

export const MQCHAIN_CUCKOO = {
  envelopeVersion: 1,
  implementation: "bloom-filters/CuckooFilter",
  implementationVersion: "3.0.4",
  defaultFalsePositiveRate: 0.001,
  defaultBucketSize: 4,
  defaultMaxKicks: 500,
  defaultSeed: 0x4d514331,
  maximumPlannedLoad: 0.2,
} as const;

type ExportedCuckoo = ReturnType<CuckooFilter["saveAsJSON"]>;

type FilterEnvelope = {
  envelopeVersion: 1;
  implementation: typeof MQCHAIN_CUCKOO.implementation;
  implementationVersion: typeof MQCHAIN_CUCKOO.implementationVersion;
  targetFalsePositiveRate: number;
  seed: number;
  itemCount: number;
  filter: ExportedCuckoo;
};

export type CuckooFilterMetadata = {
  implementation: string;
  implementationVersion: string;
  itemCount: number;
  targetFalsePositiveRate: number;
  seed: number;
  serializedBytes: number;
  contentSha256: string;
};

export interface MembershipFilter {
  maybeHas(key: Uint8Array): boolean;
  delete(key: Uint8Array): boolean;
  serialize(): Uint8Array;
  metadata(): CuckooFilterMetadata;
}

function keyString(key: Uint8Array) {
  return Buffer.from(key).toString("hex");
}

function nextPowerOfTwo(value: number) {
  return 2 ** Math.ceil(Math.log2(Math.max(value, 1)));
}

function fingerprintHexCharacters(targetFalsePositiveRate: number) {
  const bits = Math.ceil(Math.log2((2 * MQCHAIN_CUCKOO.defaultBucketSize) / targetFalsePositiveRate));
  const characters = Math.ceil(bits / 4);
  if (characters > 4) {
    throw new Error("The selected Cuckoo implementation cannot satisfy this false-positive target.");
  }
  return characters;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseEnvelope(bytes: Uint8Array): FilterEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("Invalid MQCHAIN Cuckoo filter serialization.");
  }
  const envelope = parsed as Partial<FilterEnvelope>;
  if (
    envelope.envelopeVersion !== MQCHAIN_CUCKOO.envelopeVersion ||
    envelope.implementation !== MQCHAIN_CUCKOO.implementation ||
    envelope.implementationVersion !== MQCHAIN_CUCKOO.implementationVersion ||
    !Number.isInteger(envelope.seed) ||
    !Number.isInteger(envelope.itemCount) ||
    typeof envelope.targetFalsePositiveRate !== "number" ||
    envelope.targetFalsePositiveRate <= 0 ||
    envelope.targetFalsePositiveRate >= 1 ||
    !envelope.filter
  ) {
    throw new Error("Unsupported or malformed MQCHAIN Cuckoo filter envelope.");
  }
  return envelope as FilterEnvelope;
}

class BloomFiltersCuckooAdapter implements MembershipFilter {
  constructor(
    private readonly filter: CuckooFilter,
    private readonly itemCount: number,
    private readonly targetFalsePositiveRate: number,
    private readonly seed: number,
  ) {}

  maybeHas(key: Uint8Array) {
    return this.filter.has(keyString(key));
  }

  delete(key: Uint8Array) {
    return this.filter.remove(keyString(key));
  }

  serialize() {
    const envelope: FilterEnvelope = {
      envelopeVersion: MQCHAIN_CUCKOO.envelopeVersion,
      implementation: MQCHAIN_CUCKOO.implementation,
      implementationVersion: MQCHAIN_CUCKOO.implementationVersion,
      targetFalsePositiveRate: this.targetFalsePositiveRate,
      seed: this.seed,
      itemCount: this.itemCount,
      filter: this.filter.saveAsJSON(),
    };
    return Uint8Array.from(Buffer.from(`${canonicalJson(envelope)}\n`, "utf8"));
  }

  metadata() {
    const serialized = this.serialize();
    return {
      implementation: MQCHAIN_CUCKOO.implementation,
      implementationVersion: MQCHAIN_CUCKOO.implementationVersion,
      itemCount: this.itemCount,
      targetFalsePositiveRate: this.targetFalsePositiveRate,
      seed: this.seed,
      serializedBytes: serialized.byteLength,
      contentSha256: createHash("sha256").update(serialized).digest("hex"),
    };
  }
}

export function buildCuckooFilter(
  keys: Iterable<Uint8Array>,
  options: { targetFalsePositiveRate?: number; seed?: number } = {},
): MembershipFilter {
  const targetFalsePositiveRate = options.targetFalsePositiveRate ?? MQCHAIN_CUCKOO.defaultFalsePositiveRate;
  const seed = options.seed ?? MQCHAIN_CUCKOO.defaultSeed;
  if (!(targetFalsePositiveRate > 0 && targetFalsePositiveRate < 1)) {
    throw new Error("targetFalsePositiveRate must be between zero and one.");
  }
  if (!Number.isInteger(seed)) throw new Error("seed must be an integer.");

  const sortedKeys = [...keys].map(keyString).sort();
  const uniqueKeys = [...new Set(sortedKeys)];
  const bucketCount = nextPowerOfTwo(
    Math.ceil(uniqueKeys.length / MQCHAIN_CUCKOO.defaultBucketSize / MQCHAIN_CUCKOO.maximumPlannedLoad),
  );
  const filter = new CuckooFilter(
    bucketCount,
    fingerprintHexCharacters(targetFalsePositiveRate),
    MQCHAIN_CUCKOO.defaultBucketSize,
    MQCHAIN_CUCKOO.defaultMaxKicks,
  );
  filter.seed = seed;
  for (const key of uniqueKeys) {
    if (!filter.add(key)) throw new Error(`Cuckoo filter insertion failed for key ${key}.`);
  }
  const adapter = new BloomFiltersCuckooAdapter(filter, uniqueKeys.length, targetFalsePositiveRate, seed);
  for (const key of uniqueKeys) {
    if (!adapter.maybeHas(Buffer.from(key, "hex"))) throw new Error(`Cuckoo filter false negative for key ${key}.`);
  }
  return adapter;
}

export function deserializeCuckooFilter(bytes: Uint8Array): MembershipFilter {
  const envelope = parseEnvelope(bytes);
  const filter = CuckooFilter.fromJSON(envelope.filter);
  if (filter.seed !== envelope.seed || filter.length !== envelope.itemCount) {
    throw new Error("Cuckoo filter envelope metadata does not match serialized filter state.");
  }
  return new BloomFiltersCuckooAdapter(
    filter,
    envelope.itemCount,
    envelope.targetFalsePositiveRate,
    envelope.seed,
  );
}
