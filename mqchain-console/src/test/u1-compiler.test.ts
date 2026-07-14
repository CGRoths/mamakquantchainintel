import { describe, expect, it } from "vitest";

import { compileU1Artifact, hashU1Build, type U1BinaryEntry } from "@/lib/mqchain/kv/u1-compiler";

const entry = (key: number, value: number): U1BinaryEntry => ({ key: Uint8Array.of(key), value: Uint8Array.of(value) });

describe("MQCHAIN U1 deterministic compiler", () => {
  it("sorts by binary key and reproduces artifact and build hashes", () => {
    const first = compileU1Artifact({
      indexName: "address_label_current_u1",
      keySchemaVersion: "MQK-U1",
      valueSchemaVersion: "MQV-U1",
      entries: [entry(3, 30), entry(1, 10), entry(2, 20)],
      absentProbeCount: 200,
    });
    const second = compileU1Artifact({
      indexName: "address_label_current_u1",
      keySchemaVersion: "MQK-U1",
      valueSchemaVersion: "MQV-U1",
      entries: [entry(2, 20), entry(3, 30), entry(1, 10)],
      absentProbeCount: 200,
    });
    expect(first.previewJsonl).toBe(second.previewJsonl);
    expect(first.contentHash).toBe(second.contentHash);
    expect(Buffer.from(first.filterBytes).equals(Buffer.from(second.filterBytes))).toBe(true);
    expect(hashU1Build("dictionary", [first])).toBe(hashU1Build("dictionary", [second]));
    expect(first.previewJsonl.split("\n")[0]).toContain('"keyHex":"01"');
  });

  it("rejects duplicate binary keys even when values differ", () => {
    expect(() =>
      compileU1Artifact({
        indexName: "duplicate_test",
        keySchemaVersion: "key",
        valueSchemaVersion: "value",
        entries: [entry(1, 10), entry(1, 11)],
        absentProbeCount: 10,
      }),
    ).toThrow(/duplicate normalized key/);
  });

  it("produces a serialized filter with no false negatives", () => {
    const artifact = compileU1Artifact({
      indexName: "metric_group_membership_u1",
      keySchemaVersion: "MQG-Key-U1",
      valueSchemaVersion: "MQG-U1",
      entries: Array.from({ length: 1_000 }, (_, index) => ({
        key: Uint8Array.from(Buffer.from(index.toString(16).padStart(8, "0"), "hex")),
        value: Uint8Array.of(index % 256),
      })),
      absentProbeCount: 1_000,
    });
    expect(artifact.rowCount).toBe(1_000);
    expect(artifact.filter.itemCount).toBe(1_000);
    expect(artifact.filter.observedFalsePositiveRate).toBeLessThanOrEqual(0.003);
  });
});
