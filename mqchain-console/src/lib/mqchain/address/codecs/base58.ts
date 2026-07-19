import { createHash } from "node:crypto";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function sha256(buffer: Uint8Array) {
  return createHash("sha256").update(buffer).digest();
}

export function bytesToHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("hex");
}

export function decodeBase58(value: string) {
  const base = 58n;
  let decoded = 0n;

  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit === -1) return null;
    decoded = decoded * base + BigInt(digit);
  }

  const bytes: number[] = [];
  while (decoded > 0n) {
    bytes.unshift(Number(decoded & 255n));
    decoded >>= 8n;
  }

  for (const char of value) {
    if (char !== "1") break;
    bytes.unshift(0);
  }

  return Uint8Array.from(bytes);
}

export function decodeBase58Check(value: string) {
  const decoded = decodeBase58(value);
  if (!decoded || decoded.length < 5) return null;

  const payload = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  const expected = sha256(sha256(payload)).slice(0, 4);
  return Buffer.from(checksum).equals(Buffer.from(expected)) ? payload : null;
}
