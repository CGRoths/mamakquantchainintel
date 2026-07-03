import { createHash } from "crypto";
import { z } from "zod";

import type { ActionResult } from "../types";

function isNextControlFlowError(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    return false;
  }

  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}

export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      error: "Validation failed.",
      fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  if (error instanceof Error) {
    return { ok: false, error: error.message };
  }

  return { ok: false, error: "Unexpected error." };
}

export async function runAction<T>(callback: () => Promise<T> | T): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await callback() };
  } catch (error) {
    if (isNextControlFlowError(error)) {
      throw error;
    }

    return toActionError(error);
  }
}

export function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJsonValue(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    throw new TypeError("Cannot hash circular JSON payload.");
  }

  if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return stableJsonValue((value as { toJSON: () => unknown }).toJSON(), seen);
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const normalized = value.map((item) => {
      const stableItem = stableJsonValue(item, seen);
      return stableItem === undefined ? null : stableItem;
    });
    seen.delete(value);
    return normalized;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined && typeof entryValue !== "function" && typeof entryValue !== "symbol")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => [key, stableJsonValue(entryValue, seen)] as const);

  seen.delete(value);
  return Object.fromEntries(entries);
}

export function stableJsonStringify(value: unknown) {
  return JSON.stringify(stableJsonValue(value, new Set<object>()));
}

export function hashJson(value: unknown) {
  return hashText(stableJsonStringify(value));
}

export function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}
