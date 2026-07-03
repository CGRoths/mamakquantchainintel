import { describe, expect, it } from "vitest";

import { CSV_UPLOAD_MAX_BYTES, csvInputFromFormData, csvTextFromFormData, csvTextFromUpload } from "@/lib/mqchain/csv-upload";

function fileLike(input: { name?: string; type?: string; size?: number; text: string }) {
  return {
    name: input.name,
    type: input.type,
    size: input.size ?? Buffer.byteLength(input.text),
    text: async () => input.text,
  };
}

describe("CSV upload guardrails", () => {
  it("reads bounded CSV uploads", async () => {
    await expect(csvTextFromUpload(fileLike({ name: "labels.csv", type: "text/csv", text: "address,chain\n0x1,ethereum" }))).resolves.toContain("address");
  });

  it("rejects oversized uploads", async () => {
    await expect(csvTextFromUpload(fileLike({ name: "labels.csv", type: "text/csv", size: CSV_UPLOAD_MAX_BYTES + 1, text: "address" }))).rejects.toThrow("exceeds");
  });

  it("rejects uploads whose decoded text exceeds the byte limit", async () => {
    await expect(
      csvTextFromUpload(fileLike({ name: "labels.csv", type: "text/csv", size: 10, text: "a".repeat(CSV_UPLOAD_MAX_BYTES + 1) })),
    ).rejects.toThrow("exceeds");
  });

  it("rejects executable-looking filenames", async () => {
    await expect(csvTextFromUpload(fileLike({ name: "labels.exe", type: "text/csv", text: "address" }))).rejects.toThrow(".csv or .txt");
  });

  it("falls back to pasted CSV text when no file is supplied", async () => {
    const formData = new FormData();
    formData.set("csvText", "address,chain\n0x1,ethereum");

    await expect(csvTextFromFormData(formData, "csvText", "csvFile")).resolves.toContain("0x1");
  });

  it("preserves uploaded CSV provenance metadata", async () => {
    const formData = new FormData();
    formData.set("csvFile", new Blob(["address,chain\n0x1,ethereum"], { type: "text/csv" }), "cex-labels.csv");

    await expect(csvInputFromFormData(formData, "csvText", "csvFile")).resolves.toMatchObject({
      inputMode: "file_upload",
      fileName: "cex-labels.csv",
      mimeType: "text/csv",
      text: expect.stringContaining("0x1"),
    });
  });

  it("labels pasted CSV provenance distinctly", async () => {
    const formData = new FormData();
    formData.set("csvText", "address,chain\n0x1,ethereum");

    await expect(csvInputFromFormData(formData, "csvText", "csvFile")).resolves.toMatchObject({
      inputMode: "pasted_text",
      mimeType: "text/csv",
      sizeBytes: Buffer.byteLength("address,chain\n0x1,ethereum"),
    });
  });
});
