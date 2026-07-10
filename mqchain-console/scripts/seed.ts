import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";

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
import { planStableDictionaryIds } from "../src/lib/mqchain/seed-reconciliation";

async function main() {
  const db = getDb();
  const ownerEmail = process.env.MQCHAIN_SEED_OWNER_EMAIL ?? "owner@mamakquant.local";
  const ownerPassword = process.env.MQCHAIN_SEED_OWNER_PASSWORD ?? "change-me-locally";
  const passwordHash = await hash(ownerPassword, 12);

  await db.transaction(async (tx) => {
    await tx
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

    const existingCategories = await tx.select().from(mqCategoryDict);
    const categoryPlans = planStableDictionaryIds(
      seedCategories.map(([categoryId, categoryCode]) => ({ preferredId: categoryId, code: categoryCode })),
      existingCategories.map((category) => ({ id: category.categoryId, code: category.categoryCode })),
    );
    const categoryIdByCode = new Map(categoryPlans.map((plan) => [plan.code, plan.id]));
    const categoryCodeByPreferredId = new Map(seedCategories.map(([categoryId, categoryCode]) => [categoryId, categoryCode]));

    for (const [categoryId, categoryCode, categoryName, parentCategoryId, domainCode, metricDomain] of seedCategories) {
      const actualCategoryId = categoryIdByCode.get(categoryCode) ?? categoryId;
      const parentCode = parentCategoryId === null ? null : categoryCodeByPreferredId.get(parentCategoryId);
      const actualParentId = parentCode ? categoryIdByCode.get(parentCode) ?? null : null;
      const values = {
        categoryName,
        parentCategoryId: actualParentId,
        domainCode,
        metricDomain,
        isActive: true,
        updatedAt: new Date(),
      };
      const existing = existingCategories.find((category) => category.categoryCode === categoryCode);

      if (existing) {
        await tx.update(mqCategoryDict).set(values).where(eq(mqCategoryDict.categoryCode, categoryCode));
      } else {
        await tx.insert(mqCategoryDict).values({ categoryId: actualCategoryId, categoryCode, ...values });
      }
    }

    for (const [entityCode, entityName, entityType, preferredCategoryId] of seedEntities) {
      const categoryCode = categoryCodeByPreferredId.get(preferredCategoryId);
      await tx
        .insert(mqEntities)
        .values({
          entityCode,
          entityName,
          entityType,
          categoryId: categoryCode ? categoryIdByCode.get(categoryCode) ?? null : null,
        })
        .onConflictDoUpdate({
          target: mqEntities.entityCode,
          set: {
            entityName,
            entityType,
            categoryId: categoryCode ? categoryIdByCode.get(categoryCode) ?? null : null,
            isActive: true,
            updatedAt: new Date(),
          },
        });
    }

    const entities = await tx.select().from(mqEntities);
    const entityIdByCode = new Map(entities.map((entity) => [entity.entityCode, entity.id]));

    for (const [entityCode, protocolCode, protocolName, protocolType, chainScope] of seedProtocols) {
      await tx
        .insert(mqProtocols)
        .values({
          entityId: entityIdByCode.get(entityCode),
          protocolCode,
          protocolName,
          protocolType,
          chainScope: [...chainScope],
        })
        .onConflictDoUpdate({
          target: mqProtocols.protocolCode,
          set: {
            entityId: entityIdByCode.get(entityCode),
            protocolName,
            protocolType,
            chainScope: [...chainScope],
            isActive: true,
            updatedAt: new Date(),
          },
        });
    }

    for (const [prefixCode, chainCode, chainName, chainFamily, addressFamily, codec, payloadLen, evmChainId] of seedPrefixes) {
      await tx
        .insert(mqKvKeyPrefixDict)
        .values({ prefixCode, chainCode, chainName, chainFamily, addressFamily, codec, payloadLen, evmChainId })
        .onConflictDoUpdate({
          target: mqKvKeyPrefixDict.prefixCode,
          set: { chainCode, chainName, chainFamily, addressFamily, codec, payloadLen, evmChainId, isActive: true, updatedAt: new Date() },
        });
    }

    const existingRoles = await tx.select().from(mqKvRoleDict);
    const rolePlans = planStableDictionaryIds(
      seedRoles.map((role) => ({ preferredId: role.roleId, code: role.roleCode })),
      existingRoles.map((role) => ({ id: role.roleId, code: role.roleCode })),
    );
    const roleIdByCode = new Map(rolePlans.map((plan) => [plan.code, plan.id]));

    for (const role of seedRoles) {
      const categoryCode = categoryCodeByPreferredId.get(role.categoryId);
      const values = {
        roleName: role.roleName,
        categoryId: categoryCode ? categoryIdByCode.get(categoryCode) : undefined,
        roleGroup: role.roleGroup,
        metricUsageDefault: role.metricUsageDefault,
        boundaryClass: role.boundaryClass,
        defaultQualityTier: role.defaultQualityTier,
        defaultFlags: role.defaultFlags,
        isActive: true,
        updatedAt: new Date(),
      };
      const existing = existingRoles.find((existingRole) => existingRole.roleCode === role.roleCode);

      if (existing) {
        await tx.update(mqKvRoleDict).set(values).where(eq(mqKvRoleDict.roleCode, role.roleCode));
      } else {
        await tx.insert(mqKvRoleDict).values({ roleId: roleIdByCode.get(role.roleCode) ?? role.roleId, roleCode: role.roleCode, ...values });
      }
    }

    for (const metricGroup of seedMetricGroups) {
      const [group] = await tx
        .insert(mqMetricGroups)
        .values({
          metricGroupCode: metricGroup.metricGroupCode,
          metricGroupName: metricGroup.metricGroupName,
          chainCode: metricGroup.chainCode,
          minConfidence: metricGroup.minConfidence,
          requireMetricEligible: metricGroup.requireMetricEligible,
        })
        .onConflictDoUpdate({
          target: mqMetricGroups.metricGroupCode,
          set: {
            metricGroupName: metricGroup.metricGroupName,
            chainCode: metricGroup.chainCode,
            minConfidence: metricGroup.minConfidence,
            requireMetricEligible: metricGroup.requireMetricEligible,
            isActive: true,
            updatedAt: new Date(),
          },
        })
        .returning();

      const [existingRule] = await tx
        .select({ id: mqMetricGroupRules.id })
        .from(mqMetricGroupRules)
        .where(eq(mqMetricGroupRules.metricGroupId, group.id))
        .limit(1);

      if (!existingRule) {
        await tx.insert(mqMetricGroupRules).values({ metricGroupId: group.id, ruleJson: metricGroup.ruleJson });
      }
    }
  });

  console.log(`Seed complete. Owner account: ${ownerEmail}. Password loaded from MQCHAIN_SEED_OWNER_PASSWORD.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
