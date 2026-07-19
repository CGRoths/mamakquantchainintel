import { bitcoinP2pkhCodec, bitcoinP2shCodec } from "./bitcoin-base58check";
import { bitcoinBech32Codec, bitcoinBech32mCodec } from "./bitcoin-segwit";
import { evm20Codec } from "./evm20";
import { createCodecRegistry } from "./registry";
import { solanaBase58Codec } from "./solana-base58-32";
import { tronBase58CheckCodec } from "./tron-base58check";

export type { AddressCodec, AddressCodecContext, AddressCodecFailure, AddressCodecResult, AddressCodecSuccess } from "./types";
export { createCodecRegistry } from "./registry";
export { bitcoinP2pkhCodec, bitcoinP2shCodec } from "./bitcoin-base58check";
export { bitcoinBech32Codec, bitcoinBech32mCodec } from "./bitcoin-segwit";
export { evm20Codec } from "./evm20";
export { solanaBase58Codec } from "./solana-base58-32";
export { tronBase58CheckCodec } from "./tron-base58check";

export const REGISTERED_ADDRESS_CODECS = Object.freeze([
  evm20Codec,
  bitcoinP2pkhCodec,
  bitcoinP2shCodec,
  bitcoinBech32Codec,
  bitcoinBech32mCodec,
  solanaBase58Codec,
  tronBase58CheckCodec,
]);

export const codecRegistry = createCodecRegistry(REGISTERED_ADDRESS_CODECS);
