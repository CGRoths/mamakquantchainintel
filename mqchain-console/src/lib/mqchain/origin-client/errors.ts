import { originErrorEnvelopeSchema } from "../contracts/origin";

export class OriginClientError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly requestId: string | null, readonly details?: unknown) {
    super(message);
    this.name = "OriginClientError";
  }
}

export function originClientErrorFromResponse(status: number, payload: unknown, fallbackRequestId: string | null) {
  const parsed = originErrorEnvelopeSchema.safeParse(payload);
  if (parsed.success) return new OriginClientError(parsed.data.error.message, status, parsed.data.error.code, parsed.data.requestId, parsed.data.error.details);
  return new OriginClientError(`MQCHAIN Origin request failed with status ${status}.`, status, "origin_request_failed", fallbackRequestId);
}
