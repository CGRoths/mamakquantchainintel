export type StableDictionarySeed = {
  preferredId: number;
  code: string;
};

export type ExistingDictionaryRow = {
  id: number;
  code: string;
};

export type StableDictionaryIdPlan = {
  id: number;
  code: string;
  exists: boolean;
};

export function planStableDictionaryIds(
  seeds: StableDictionarySeed[],
  existingRows: ExistingDictionaryRow[],
): StableDictionaryIdPlan[] {
  const existingByCode = new Map(existingRows.map((row) => [row.code, row.id]));
  const usedIds = new Set(existingRows.map((row) => row.id));
  let nextFallbackId = Math.max(0, ...usedIds, ...seeds.map((seed) => seed.preferredId)) + 1;

  return seeds.map((seed) => {
    const existingId = existingByCode.get(seed.code);
    if (existingId !== undefined) {
      return { id: existingId, code: seed.code, exists: true };
    }

    let id = seed.preferredId;
    if (usedIds.has(id)) {
      while (usedIds.has(nextFallbackId)) nextFallbackId += 1;
      id = nextFallbackId;
      nextFallbackId += 1;
    }

    usedIds.add(id);
    return { id, code: seed.code, exists: false };
  });
}
