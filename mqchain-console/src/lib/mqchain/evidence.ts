export function parseEvidencePayload(payloadJson?: string | null) {
  const raw = payloadJson?.trim();

  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Evidence payload must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

export function summarizeEvidencePayload(payload: Record<string, unknown>) {
  const keys = Object.keys(payload);
  if (!keys.length) {
    return "empty_payload";
  }

  return keys.slice(0, 8).join(", ");
}
