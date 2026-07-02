import { describe, expect, it } from "vitest";

import { parseEvidencePayload, summarizeEvidencePayload } from "@/lib/mqchain/evidence";

describe("evidence payload helpers", () => {
  it("parses JSON object evidence payloads", () => {
    const payload = parseEvidencePayload('{"source_role_label":"cold wallet","block_height":123}');

    expect(payload.source_role_label).toBe("cold wallet");
    expect(payload.block_height).toBe(123);
    expect(summarizeEvidencePayload(payload)).toContain("source_role_label");
  });

  it("rejects non-object JSON payloads", () => {
    expect(() => parseEvidencePayload("[1,2,3]")).toThrow("JSON object");
  });

  it("allows empty evidence payloads", () => {
    expect(parseEvidencePayload("")).toEqual({});
  });
});
