import { z } from "zod";

import { KV_BUILD_REGISTRATION_STATUSES } from "../constants";

export const KV_BUILD_REGISTRATION_API_MAX_BODY_BYTES = 1024 * 1024;

function optionalText() {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().optional(),
  );
}

export const createKvBuildManifestSchema = z.object({
  buildHash: optionalText(),
  dictionaryVersion: optionalText(),
  status: z.enum(KV_BUILD_REGISTRATION_STATUSES).default("compiled"),
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

export const kvBuildRegistrationApiRequestSchema = z
  .object({
    buildHash: optionalText(),
    dictionaryVersion: optionalText(),
    status: z.enum(KV_BUILD_REGISTRATION_STATUSES).default("compiled"),
    rowCount: z.coerce.number().int().min(0).default(0),
    storageUri: optionalText(),
    manifest: z.record(z.string(), z.unknown()).optional(),
    manifestJson: z.string().trim().optional(),
  })
  .refine((value) => value.manifest || value.manifestJson, {
    message: "Provide either manifest or manifestJson.",
    path: ["manifest"],
  })
  .transform((value) => ({
    buildHash: value.buildHash,
    dictionaryVersion: value.dictionaryVersion,
    status: value.status,
    rowCount: value.rowCount,
    storageUri: value.storageUri,
    manifestJson: value.manifestJson ?? JSON.stringify(value.manifest),
  }));
