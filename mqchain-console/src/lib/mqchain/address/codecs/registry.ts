import type { AddressCodec } from "./types";

export type AddressCodecRegistry = Readonly<{
  getCodec(code: string): AddressCodec | undefined;
  requireCodec(code: string): AddressCodec;
  hasCodec(code: string): boolean;
  listRegisteredCodecs(): readonly AddressCodec[];
}>;

export function createCodecRegistry(codecs: readonly AddressCodec[]): AddressCodecRegistry {
  const codecsByCode = new Map<string, AddressCodec>();
  for (const codec of codecs) {
    if (codecsByCode.has(codec.code)) throw new Error(`duplicate_codec_code:${codec.code}`);
    codecsByCode.set(codec.code, codec);
  }
  const inventory = Object.freeze([...codecsByCode.values()].sort((left, right) => left.code.localeCompare(right.code)));

  return Object.freeze({
    getCodec: (code: string) => codecsByCode.get(code),
    requireCodec(code: string) {
      const codec = codecsByCode.get(code);
      if (!codec) throw new Error(`codec_not_registered:${code}`);
      return codec;
    },
    hasCodec: (code: string) => codecsByCode.has(code),
    listRegisteredCodecs: () => inventory,
  });
}
