import { describe, expect, it } from "vitest";

import { buildCuckooFilter, deserializeCuckooFilter } from "@/lib/mqchain/kv/filter";
import { memoryKvLayer, MQCHAIN_TOMBSTONE, resolveLayeredValue } from "@/lib/mqchain/kv/layers";

const key = (value: number) => Uint8Array.from(Buffer.from(value.toString(16).padStart(8, "0"), "hex"));

describe("MQCHAIN U1 Cuckoo filter", () => {
  it("builds byte-identical output regardless of input order", () => {
    const ascending = Array.from({ length: 2_000 }, (_, index) => key(index));
    const descending = [...ascending].reverse();
    const first = buildCuckooFilter(ascending).serialize();
    const second = buildCuckooFilter(descending).serialize();
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it("round-trips without false negatives and records a content hash", () => {
    const inserted = Array.from({ length: 5_000 }, (_, index) => key(index));
    const serialized = buildCuckooFilter(inserted).serialize();
    const restored = deserializeCuckooFilter(serialized);
    expect(inserted.every(item => restored.maybeHas(item))).toBe(true);
    expect(restored.metadata()).toMatchObject({ itemCount: 5_000, targetFalsePositiveRate: 0.001 });
    expect(restored.metadata().contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps observed false positives within a conservative test bound", () => {
    const filter = buildCuckooFilter(Array.from({ length: 10_000 }, (_, index) => key(index)));
    const absent = Array.from({ length: 20_000 }, (_, index) => key(index + 100_000));
    const observed = absent.filter(item => filter.maybeHas(item)).length / absent.length;
    expect(observed).toBeLessThanOrEqual(0.003);
  });

  it("rejects malformed serialized envelopes", () => {
    expect(() => deserializeCuckooFilter(Buffer.from("{}"))).toThrow(/malformed/);
    expect(() => deserializeCuckooFilter(Buffer.from("not-json"))).toThrow(/Invalid/);
  });
});

describe("MQCHAIN base/delta resolution", () => {
  it("resolves newest delta first and stops on tombstones", () => {
    const target = key(7);
    const base = memoryKvLayer("base", [[target, Uint8Array.of(1)]], () => true);
    const oldDelta = memoryKvLayer("delta-1", [[target, Uint8Array.of(2)]], () => true);
    const newestDelta = memoryKvLayer("delta-2", [[target, MQCHAIN_TOMBSTONE]], () => true);
    expect(resolveLayeredValue(target, [oldDelta, base])).toEqual(Uint8Array.of(2));
    expect(resolveLayeredValue(target, [newestDelta, oldDelta, base])).toBeUndefined();
  });

  it("does not read a layer when its filter says absent", () => {
    const target = key(8);
    let reads = 0;
    const layer = {
      id: "base",
      maybeHas: () => false,
      get: () => {
        reads += 1;
        return Uint8Array.of(1);
      },
    };
    expect(resolveLayeredValue(target, [layer])).toBeUndefined();
    expect(reads).toBe(0);
  });
});
