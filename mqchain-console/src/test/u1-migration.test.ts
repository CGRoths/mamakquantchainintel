import { describe, expect, it } from "vitest";

import { mapLegacyPrefix, validateU1Backfill } from "@/lib/mqchain/u1-migration";

const mappings = [
  { prefixCode: 0x0010, namespaceId: 1, addressCodecId: 10 },
  { prefixCode: 0x0101, namespaceId: 4, addressCodecId: 1 },
];

describe("prefix to U1 compatibility", () => {
  it("maps a frozen prefix deterministically and rejects ambiguous mappings", () => {
    expect(mapLegacyPrefix(0x0101, mappings)).toEqual({ prefixCode: 0x0101, namespaceId: 4, addressCodecId: 1 });
    expect(mapLegacyPrefix(0x0101, [...mappings, { prefixCode: 0x0101, namespaceId: 99, addressCodecId: 1 }])).toBeNull();
  });

  it("disambiguates the frozen Bitcoin SegWit prefix from the witness-version payload", () => {
    const segwitMappings = [
      { prefixCode: 0x0012, namespaceId: 3, addressCodecId: 12 },
      { prefixCode: 0x0012, namespaceId: 47, addressCodecId: 13 },
    ];
    expect(mapLegacyPrefix(0x0012, segwitMappings, `00${"11".repeat(20)}`)).toMatchObject({ namespaceId: 3, addressCodecId: 12 });
    expect(mapLegacyPrefix(0x0012, segwitMappings, `01${"22".repeat(32)}`)).toMatchObject({ namespaceId: 47, addressCodecId: 13 });
    expect(mapLegacyPrefix(0x0012, segwitMappings, `11${"33".repeat(32)}`)).toBeNull();
  });

  it("reports missing and mismatched identities without changing source rows", () => {
    const rows = [
      { subjectKind: "registry" as const, subjectId: 1, prefixCode: 0x0101, namespaceId: 4, addressCodecId: 1, payloadHex: "11".repeat(20) },
      { subjectKind: "candidate" as const, subjectId: 2, prefixCode: 0x0101, namespaceId: null, addressCodecId: null, payloadHex: "22".repeat(20) },
      { subjectKind: "candidate" as const, subjectId: 3, prefixCode: 999, namespaceId: null, addressCodecId: null, payloadHex: "33".repeat(20) },
    ];
    const report = validateU1Backfill(rows, mappings);

    expect(report.compatible).toBe(1);
    expect(report.conflicts.map((row) => row.reason)).toEqual(["u1_identity_missing", "unmapped_prefix"]);
    expect(rows[1].namespaceId).toBeNull();
  });
});
