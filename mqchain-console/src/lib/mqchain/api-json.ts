export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes.`);
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readBoundedJsonBody(request: Request, maxBytes: number) {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  return JSON.parse(rawBody) as unknown;
}
