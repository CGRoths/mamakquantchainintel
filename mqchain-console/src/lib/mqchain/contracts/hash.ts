import { createHash } from "node:crypto";

function stableJsonValue(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) throw new TypeError("Cannot hash circular JSON payload.");
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return stableJsonValue((value as { toJSON: () => unknown }).toJSON(), seen);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const normalized = value.map(item => stableJsonValue(item, seen) ?? null);
    seen.delete(value);
    return normalized;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined && typeof entry !== "function" && typeof entry !== "symbol")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, stableJsonValue(entry, seen)] as const);
  seen.delete(value);
  return Object.fromEntries(entries);
}

export function stableJsonStringify(value: unknown) {
  return JSON.stringify(stableJsonValue(value, new Set<object>()));
}

export function hashJson(value: unknown) {
  return createHash("sha256").update(stableJsonStringify(value)).digest("hex");
}
