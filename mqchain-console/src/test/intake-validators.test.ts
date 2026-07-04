import { describe, expect, it } from "vitest";

import { CSV_UPLOAD_MAX_BYTES } from "@/lib/mqchain/csv-upload";
import { csvIntakeSchema, sourceJobIntakeApiRequestSchema } from "@/lib/mqchain/validators/intake";

describe("intake validators", () => {
  it("rejects oversized CSV text at the service validation boundary", () => {
    expect(() =>
      csvIntakeSchema.parse({
        sourceType: "csv_upload",
        sourceName: "Oversized upload",
        csvText: "a".repeat(CSV_UPLOAD_MAX_BYTES + 1),
      }),
    ).toThrow("CSV input exceeds");
  });

  it("rejects oversized uploaded-size metadata at the service validation boundary", () => {
    expect(() =>
      csvIntakeSchema.parse({
        sourceType: "csv_upload",
        sourceName: "Oversized metadata",
        csvText: "address,chain\n0x1,ethereum",
        uploadSizeBytes: CSV_UPLOAD_MAX_BYTES + 1,
      }),
    ).toThrow();
  });

  it("validates the source-job intake API request envelope", () => {
    expect(
      sourceJobIntakeApiRequestSchema.parse({
        intakeType: "manual",
        payload: {
          sourceName: "Manual reserve input",
          addresses: "bc1qexample",
        },
      }).intakeType,
    ).toBe("manual");

    expect(() =>
      sourceJobIntakeApiRequestSchema.parse({
        intakeType: "registry_commit",
        payload: {},
      }),
    ).toThrow();
  });
});
