export const CSV_UPLOAD_MAX_BYTES = 1_000_000;

type CsvUploadFile = {
  name?: string;
  size: number;
  type?: string;
  text: () => Promise<string>;
};

export type CsvInputPayload = {
  text: string;
  inputMode: "file_upload" | "pasted_text";
  fileName?: string;
  mimeType?: string;
  sizeBytes: number;
};

function isCsvUploadFile(value: unknown): value is CsvUploadFile {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { size?: unknown }).size === "number" &&
    typeof (value as { text?: unknown }).text === "function"
  );
}

function assertCsvFileMetadata(file: CsvUploadFile) {
  if (file.size <= 0) {
    throw new Error("CSV upload is empty.");
  }

  if (file.size > CSV_UPLOAD_MAX_BYTES) {
    throw new Error(`CSV upload exceeds ${CSV_UPLOAD_MAX_BYTES} bytes.`);
  }

  const name = file.name?.toLowerCase() ?? "";
  const type = file.type?.toLowerCase() ?? "";
  const hasCsvName = name.endsWith(".csv") || name.endsWith(".txt");
  const hasCsvType = ["text/csv", "text/plain", "application/vnd.ms-excel", ""].includes(type);

  if (name && !hasCsvName) {
    throw new Error("CSV upload must use a .csv or .txt file name.");
  }

  if (!hasCsvType) {
    throw new Error("CSV upload must be text/csv or text/plain.");
  }
}

export async function csvInputFromUpload(file: unknown): Promise<CsvInputPayload | null> {
  if (!isCsvUploadFile(file)) {
    return null;
  }

  assertCsvFileMetadata(file);
  const text = await file.text();
  if (!text.trim()) {
    throw new Error("CSV upload does not contain any rows.");
  }

  return {
    text,
    inputMode: "file_upload",
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

export async function csvTextFromUpload(file: unknown) {
  return (await csvInputFromUpload(file))?.text ?? "";
}

export async function csvInputFromFormData(formData: FormData, textKey: string, fileKey: string): Promise<CsvInputPayload> {
  const filePayload = await csvInputFromUpload(formData.get(fileKey));
  if (filePayload && filePayload.sizeBytes > 0) {
    return filePayload;
  }

  const pasted = formData.get(textKey);
  if (typeof pasted === "string" && pasted.trim()) {
    const sizeBytes = Buffer.byteLength(pasted);
    if (sizeBytes > CSV_UPLOAD_MAX_BYTES) {
      throw new Error(`CSV input exceeds ${CSV_UPLOAD_MAX_BYTES} bytes.`);
    }
    return {
      text: pasted,
      inputMode: "pasted_text",
      sizeBytes,
      mimeType: "text/csv",
    };
  }

  throw new Error("Provide a CSV file or pasted CSV text.");
}

export async function csvTextFromFormData(formData: FormData, textKey: string, fileKey: string) {
  return (await csvInputFromFormData(formData, textKey, fileKey)).text;
}
