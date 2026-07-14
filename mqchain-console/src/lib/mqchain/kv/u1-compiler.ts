import { createHash } from "node:crypto";

import { buildCuckooFilter, deserializeCuckooFilter, type CuckooFilterMetadata } from "./filter";

export type U1BinaryEntry = {
  key: Uint8Array;
  value: Uint8Array;
  debug?: Record<string, unknown>;
};

export type U1CompiledArtifact = {
  indexName: string;
  rowCount: number;
  keySchemaVersion: string;
  valueSchemaVersion: string;
  contentHash: string;
  previewJsonl: string;
  filterBytes: Uint8Array;
  filter: CuckooFilterMetadata & {
    observedFalsePositiveRate: number;
    absentProbeCount: number;
  };
};

function sha256Bytes(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function compareBytes(left: Uint8Array, right: Uint8Array) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function hex(value: Uint8Array) {
  return Buffer.from(value).toString("hex");
}

function binaryContentHash(entries: readonly U1BinaryEntry[]) {
  const hash = createHash("sha256");
  for (const entry of entries) {
    const lengths = Buffer.alloc(8);
    lengths.writeUInt32BE(entry.key.byteLength, 0);
    lengths.writeUInt32BE(entry.value.byteLength, 4);
    hash.update(lengths).update(entry.key).update(entry.value);
  }
  return hash.digest("hex");
}

function absentProbe(indexName: string, index: number) {
  return Uint8Array.from(createHash("sha256").update(`MQCHAIN-U1:${indexName}:${index}`).digest());
}

export function compileU1Artifact(input: {
  indexName: string;
  keySchemaVersion: string;
  valueSchemaVersion: string;
  entries: Iterable<U1BinaryEntry>;
  absentProbeCount?: number;
}): U1CompiledArtifact {
  const entries = [...input.entries].sort((left, right) => compareBytes(left.key, right.key));
  for (let index = 1; index < entries.length; index += 1) {
    if (compareBytes(entries[index - 1].key, entries[index].key) === 0) {
      throw new Error(`${input.indexName} has duplicate normalized key ${hex(entries[index].key)}.`);
    }
  }

  const builtFilter = buildCuckooFilter(entries.map(entry => entry.key));
  const filterBytes = builtFilter.serialize();
  const restoredFilter = deserializeCuckooFilter(filterBytes);
  for (const entry of entries) {
    if (!restoredFilter.maybeHas(entry.key)) {
      throw new Error(`${input.indexName} filter has a false negative after serialization for ${hex(entry.key)}.`);
    }
  }

  const keySet = new Set(entries.map(entry => hex(entry.key)));
  const requestedProbeCount = input.absentProbeCount ?? 10_000;
  let tested = 0;
  let falsePositives = 0;
  for (let index = 0; tested < requestedProbeCount; index += 1) {
    const probe = absentProbe(input.indexName, index);
    if (keySet.has(hex(probe))) continue;
    tested += 1;
    if (restoredFilter.maybeHas(probe)) falsePositives += 1;
  }

  const previewJsonl = entries
    .map(entry => JSON.stringify({ keyHex: hex(entry.key), valueHex: hex(entry.value), debug: entry.debug ?? null }))
    .join("\n") + (entries.length ? "\n" : "");
  return {
    indexName: input.indexName,
    rowCount: entries.length,
    keySchemaVersion: input.keySchemaVersion,
    valueSchemaVersion: input.valueSchemaVersion,
    contentHash: binaryContentHash(entries),
    previewJsonl,
    filterBytes,
    filter: {
      ...restoredFilter.metadata(),
      observedFalsePositiveRate: tested === 0 ? 0 : falsePositives / tested,
      absentProbeCount: tested,
    },
  };
}

export function hashU1Build(dictionaryVersion: string, artifacts: readonly U1CompiledArtifact[]) {
  const identity = artifacts
    .map(artifact => ({
      indexName: artifact.indexName,
      keySchemaVersion: artifact.keySchemaVersion,
      valueSchemaVersion: artifact.valueSchemaVersion,
      rowCount: artifact.rowCount,
      contentHash: artifact.contentHash,
      filterHash: sha256Bytes(artifact.filterBytes),
    }))
    .sort((left, right) => left.indexName.localeCompare(right.indexName));
  return sha256Bytes(JSON.stringify({ schema: "MQCHAIN-U1-BUILD-1", dictionaryVersion, artifacts: identity }));
}
