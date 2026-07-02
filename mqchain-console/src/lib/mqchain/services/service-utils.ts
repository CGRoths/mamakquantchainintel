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

export function hashJson(value: unknown) {
  return hashText(JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort()));
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
