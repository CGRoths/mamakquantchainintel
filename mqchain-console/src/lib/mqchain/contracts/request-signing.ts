import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { originActorSchema, type OriginActorClaims } from "./origin";

export const MQCHAIN_SIGNATURE_VERSION = "v1";
export const MQCHAIN_SIGNATURE_HEADER = "x-mqchain-signature";
export const MQCHAIN_ACTOR_HEADER = "x-mqchain-employee-context";
export const MQCHAIN_REQUEST_ID_HEADER = "x-mqchain-request-id";
export const MQCHAIN_SIGNATURE_MAX_AGE_SECONDS = 60;

export function originActorClaimError(claims: OriginActorClaims, expectedAudience: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (claims.aud !== expectedAudience) return "invalid_audience" as const;
  if (Math.abs(nowSeconds - claims.iat) > MQCHAIN_SIGNATURE_MAX_AGE_SECONDS) return "expired_signature" as const;
  return null;
}

export class OriginReplayWindow {
  private readonly entries = new Map<string, number>();

  constructor(private readonly maxEntries = 10_000, private readonly ttlSeconds = MQCHAIN_SIGNATURE_MAX_AGE_SECONDS * 2) {}

  checkAndRemember(id: string, nowSeconds = Math.floor(Date.now() / 1000)) {
    for (const [key, expiresAt] of this.entries) if (expiresAt <= nowSeconds) this.entries.delete(key);
    if (this.entries.has(id)) return false;
    this.entries.set(id, nowSeconds + this.ttlSeconds);
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
    return true;
  }
}

export function canonicalOriginPath(pathAndQuery: string): string {
  const url = new URL(pathAndQuery, "http://mqchain-origin.local");
  url.searchParams.sort();
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function encodeOriginActorClaims(claims: OriginActorClaims): string {
  return Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
}

export function decodeOriginActorClaims(value: string): OriginActorClaims {
  const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  return originActorSchema.parse(decoded);
}

export function canonicalOriginSignatureInput(input: {
  method: string;
  pathAndQuery: string;
  requestId: string;
  bodyText: string;
  encodedActor: string;
}): string {
  return [
    MQCHAIN_SIGNATURE_VERSION,
    input.method.toUpperCase(),
    canonicalOriginPath(input.pathAndQuery),
    input.requestId,
    sha256Hex(input.bodyText),
    input.encodedActor,
  ].join("\n");
}

export function signOriginRequest(input: {
  secret: string;
  method: string;
  pathAndQuery: string;
  requestId: string;
  bodyText: string;
  encodedActor: string;
}): string {
  const canonical = canonicalOriginSignatureInput(input);
  const digest = createHmac("sha256", input.secret).update(canonical, "utf8").digest("base64url");
  return `${MQCHAIN_SIGNATURE_VERSION}=${digest}`;
}

export function verifyOriginRequestSignature(input: {
  secret: string;
  signature: string;
  method: string;
  pathAndQuery: string;
  requestId: string;
  bodyText: string;
  encodedActor: string;
}): boolean {
  const expected = signOriginRequest(input);
  const actualBytes = Buffer.from(input.signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
