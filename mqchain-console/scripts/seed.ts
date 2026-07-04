import { hash } from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "../src/db/client";
import {
  mqCategoryDict,
  mqEntities,
  mqKvKeyPrefixDict,
  mqKvRoleDict,
  mqMetricGroupRules,
  mqMetricGroups,
  mqProtocols,
  mqUsers,
} from "../src/db/schema";
import { seedCategories, seedEntities, seedMetricGroups, seedPrefixes, seedProtocols, seedRoles } from "../src/lib/mqchain/data/seed-data";

async function main() {
  const db = getDb();
  const ownerEmail = process.env.MQCHAIN_SEED_OWNER_EMAIL ?? "owner@mamakquant.local";
  const ownerPassword = process.env.MQCHAIN_SEED_OWNER_PASSWORD ?? "change-me-locally";
  const passwordHash = await hash(ownerPassword, 12);

  await db
    .insert(mqUsers)
    .values({
      email: ownerEmail,
      displayName: "MamakQuant Owner",
      passwordHash,
      role: "owner",
      isActive: true,
    })
    .onConflictDoUpdate({
      target: mqUsers.email,
      set: {
        displayName: "MamakQuant Owner",
        passwordHash,
        role: "owner",
        isActive: true,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(mqCategoryDict)
    .values(
      seedCategories.map(([categoryId, categoryCode, categoryName, parentCategoryId, domainCode, metricDomain]) => ({
        categoryId,
        categoryCode,
        categoryName,
        parentCategoryId,
        domainCode,
        metricDomain,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(mqEntities)
    .values(
      seedEntities.map(([entityCode, entityName, entityType, categoryId]) => ({
        entityCode,
        entityName,
        entityType,
        categoryId: categoryId ?? null,
      })),
    )
    .onConflictDoNothing();

  for (const [entityCode, , , categoryId] of seedEntities) {
    await db
      .update(mqEntities)
      .set({ categoryId, updatedAt: new Date() })
      .where(and(eq(mqEntities.entityCode, entityCode), isNull(mqEntities.categoryId)));
  }

  const entities = await db.select().from(mqEntities);
  const entityIdByCode = new Map(entities.map((entity) => [entity.entityCode, entity.id]));

  await db
    .insert(mqProtocols)
    .values(
      seedProtocols.map(([entityCode, protocolCode, protocolName, protocolType, chainScope]) => ({
        entityId: entityIdByCode.get(entityCode),
        protocolCode,
        protocolName,
        protocolType,
        chainScope: [...chainScope],
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(mqKvKeyPrefixDict)
    .values(
      seedPrefixes.map(([prefixCode, chainCode, chainName, chainFamily, addressFamily, codec, payloadLen, evmChainId]) => ({
        prefixCode,
        chainCode,
        chainName,
        chainFamily,
        addressFamily,
        codec,
        payloadLen,
        evmChainId,
      })),
    )
    .onConflictDoNothing();

  await db.insert(mqKvRoleDict).values(seedRoles).onConflictDoNothing();

  for (const metricGroup of seedMetricGroups) {
    await db
      .insert(mqMetricGroups)
      .values({
        metricGroupCode: metricGroup.metricGroupCode,
        metricGroupName: metricGroup.metricGroupName,
        chainCode: metricGroup.chainCode,
        minConfidence: metricGroup.minConfidence,
        requireMetricEligible: metricGroup.requireMetricEligible,
      })
      .onConflictDoNothing();

    const [group] = await db.select().from(mqMetricGroups).where(eq(mqMetricGroups.metricGroupCode, metricGroup.metricGroupCode)).limit(1);
    if (group) {
      const [existingRule] = await db
        .select({ id: mqMetricGroupRules.id })
        .from(mqMetricGroupRules)
        .where(eq(mqMetricGroupRules.metricGroupId, group.id))
        .limit(1);

      if (!existingRule) {
        await db.insert(mqMetricGroupRules).values({ metricGroupId: group.id, ruleJson: metricGroup.ruleJson });
      }
    }
  }

  console.log(`Seed complete. Owner login: ${ownerEmail} / ${ownerPassword}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
