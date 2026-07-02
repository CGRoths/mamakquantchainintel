import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqAuditLog, mqKvBuilds } from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import { buildKvManifestActivationPreflight } from "../kv-manifest";
import { createKvBuildManifestSchema, kvBuildIdSchema } from "../validators/kv-manifest";
import { hashJson } from "./service-utils";

export async function listKvBuilds(limit = 100) {
  return getDb().select().from(mqKvBuilds).orderBy(desc(mqKvBuilds.createdAt)).limit(limit);
}

export async function getKvBuild(id: number) {
  const [build] = await getDb().select().from(mqKvBuilds).where(eq(mqKvBuilds.id, id)).limit(1);
  return build ?? null;
}

export async function createKvBuildManifest(input: unknown) {
  const actor = await assertPermission("batch:commit");
  const parsed = createKvBuildManifestSchema.parse(input);
  const baseManifest = {
    ...parsed.manifestJson,
    dictionaryVersion: parsed.dictionaryVersion ?? null,
    rowCount: parsed.rowCount,
    artifactStatus: parsed.status,
    storageUri: parsed.storageUri ?? null,
  };
  const buildHash = parsed.buildHash || hashJson({
    dictionaryVersion: parsed.dictionaryVersion,
    rowCount: parsed.rowCount,
    storageUri: parsed.storageUri,
    manifest: baseManifest,
  });
  const manifest = {
    ...baseManifest,
    buildHash,
    controlPlaneCreatedAt: new Date().toISOString(),
    note: "RocksDB compilation is external; MQCHAIN Console tracks the manifest and activation state.",
  };

  const db = getDb();
  return db.transaction(async (tx) => {
    const [build] = await tx
      .insert(mqKvBuilds)
      .values({
        buildHash,
        dictionaryVersion: parsed.dictionaryVersion,
        status: parsed.status,
        rowCount: parsed.rowCount,
        storageUri: parsed.storageUri,
        manifest,
        createdBy: actor.id,
      })
      .returning();

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "kv_build_manifest_created",
      targetTable: "mq_kv_builds",
      targetId: String(build.id),
      payload: { buildHash, status: parsed.status, rowCount: parsed.rowCount, storageUri: parsed.storageUri },
    });

    return build;
  });
}

export async function activateKvBuildManifest(input: unknown) {
  const actor = await assertPermission("batch:commit");
  const parsed = kvBuildIdSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [build] = await tx.select().from(mqKvBuilds).where(eq(mqKvBuilds.id, parsed.buildId)).limit(1);

    if (!build) {
      throw new Error("KV build manifest not found.");
    }

    const preflight = buildKvManifestActivationPreflight(build);
    if (!preflight.canActivate) {
      throw new Error(`KV build manifest failed activation preflight. ${preflight.blockers.join(" ")}`);
    }

    await tx
      .update(mqKvBuilds)
      .set({ status: "superseded" })
      .where(eq(mqKvBuilds.status, "active"));

    const activatedAt = new Date();
    const [updated] = await tx
      .update(mqKvBuilds)
      .set({
        status: "active",
        activatedAt,
        manifest: {
          ...(build.manifest ?? {}),
          activatedAt: activatedAt.toISOString(),
          activatedBy: actor.email,
        },
      })
      .where(eq(mqKvBuilds.id, parsed.buildId))
      .returning();

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "kv_build_manifest_activated",
      targetTable: "mq_kv_builds",
      targetId: String(updated.id),
      payload: { beforeStatus: build.status, afterStatus: updated.status, buildHash: updated.buildHash, preflight },
    });

    return updated;
  });
}
