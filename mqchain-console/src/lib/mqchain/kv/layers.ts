export const MQCHAIN_TOMBSTONE = Symbol("mqchain-tombstone");

export type LayerValue = Uint8Array | typeof MQCHAIN_TOMBSTONE;

export type KvLayer = {
  id: string;
  maybeHas(key: Uint8Array): boolean;
  get(key: Uint8Array): LayerValue | undefined;
};

function keyHex(key: Uint8Array) {
  return Buffer.from(key).toString("hex");
}

export function resolveLayeredValue(key: Uint8Array, newestFirstLayers: readonly KvLayer[]) {
  for (const layer of newestFirstLayers) {
    if (!layer.maybeHas(key)) continue;
    const value = layer.get(key);
    if (value === MQCHAIN_TOMBSTONE) return undefined;
    if (value !== undefined) return value;
  }
  return undefined;
}

export function memoryKvLayer(
  id: string,
  entries: Iterable<readonly [Uint8Array, LayerValue]>,
  maybeHas: (key: Uint8Array) => boolean,
): KvLayer {
  const values = new Map<string, LayerValue>([...entries].map(([key, value]) => [keyHex(key), value]));
  return { id, maybeHas, get: key => values.get(keyHex(key)) };
}
