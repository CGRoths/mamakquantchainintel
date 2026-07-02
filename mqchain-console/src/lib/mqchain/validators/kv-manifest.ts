import { z } from "zod";

function optionalText() {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().optional(),
  );
}

export const createKvBuildManifestSchema = z.object({
  buildHash: optionalText(),
  dictionaryVersion: optionalText(),
  status: z.enum(["pending", "compiled", "failed"]).default("compiled"),
  rowCount: z.coerce.number().int().min(0).default(0),
  storageUri: optionalText(),
  manifestJson: z
    .string()
    .trim()
    .default("{}")
    .transform((value) => {
      if (!value) return {};
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Manifest JSON must be an object.");
      }
      return parsed as Record<string, unknown>;
    }),
});

export const kvBuildIdSchema = z.object({
  buildId: z.coerce.number().int().positive(),
});
