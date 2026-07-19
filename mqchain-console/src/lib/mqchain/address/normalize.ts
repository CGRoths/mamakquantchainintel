import type { NormalizedAddress } from "../types";
import {
  bitcoinBech32Codec,
  bitcoinBech32mCodec,
  bitcoinP2pkhCodec,
  bitcoinP2shCodec,
  evm20Codec,
  solanaBase58Codec,
  tronBase58CheckCodec,
} from "./codecs";
import type { AddressCodec } from "./codecs";

type Evm20Identity = { chainCode: string; prefixCode: number | null; namespaceId: number };

const EVM20_IDENTITIES: Record<string, Evm20Identity> = {};

function registerEvm20(chainCode: string, namespaceId: number, prefixCode: number | null, aliases: string[] = []) {
  const identity = { chainCode, namespaceId, prefixCode };
  for (const alias of [chainCode, ...aliases]) EVM20_IDENTITIES[alias] = identity;
}

registerEvm20("ethereum", 4, 0x0101, ["eth", "ethereum-mainnet"]);
registerEvm20("polygon", 5, 0x0102, ["polygon-pos-mainnet"]);
registerEvm20("base", 6, 0x0103, ["base-mainnet"]);
registerEvm20("arbitrum", 7, 0x0104, ["arbitrum-one"]);
registerEvm20("optimism", 8, 0x0105, ["op", "op-mainnet"]);
registerEvm20("bsc", 9, 0x0106, ["bnb", "bnb-smart-chain-mainnet"]);
registerEvm20("avalanche", 12, null, ["avax", "avalanche-c-chain"]);
registerEvm20("gnosis-mainnet", 13, null);
registerEvm20("fantom-opera", 14, null);
registerEvm20("cronos-mainnet", 15, null);
registerEvm20("zksync-era-mainnet", 16, null);
registerEvm20("linea-mainnet", 17, null);
registerEvm20("scroll-mainnet", 18, null);
registerEvm20("mantle-mainnet", 19, null);
registerEvm20("blast-mainnet", 20, null);
registerEvm20("celo-mainnet", 21, null);
registerEvm20("moonbeam-mainnet", 22, null);
registerEvm20("moonriver-mainnet", 23, null);
registerEvm20("kaia-mainnet", 24, null);
registerEvm20("berachain-mainnet", 25, null);
registerEvm20("sonic-mainnet", 26, null);

const WALLET_CONTEXT = Object.freeze({ parameters: Object.freeze({}), identifierKind: "wallet_address" });
const SOLANA_CONTEXT = Object.freeze({ parameters: Object.freeze({}), identifierKind: "wallet_or_public_key" });

function normalizeWithCodec(codec: AddressCodec, rawAddress: string, solana = false) {
  const result = codec.normalize(rawAddress, solana ? SOLANA_CONTEXT : WALLET_CONTEXT);
  return result.ok ? result : null;
}

function normalizeChainHint(chainHint?: string | null) {
  return chainHint?.trim().toLowerCase().replace(/_/g, "-") ?? null;
}

function success(value: Omit<NormalizedAddress, "isValid">): NormalizedAddress {
  return { ...value, isValid: true };
}

function failure(rawAddress: string, error: string): NormalizedAddress {
  return {
    chainCode: null,
    addressFamily: null,
    rawAddress,
    normalizedAddress: rawAddress.trim(),
    prefixCode: null,
    namespaceId: null,
    addressCodecId: null,
    payloadHex: null,
    isValid: false,
    error,
  };
}

function normalizeEvm(rawAddress: string, chainHint?: string | null): NormalizedAddress | null {
  const normalized = normalizeWithCodec(evm20Codec, rawAddress);
  if (!normalized) return null;

  const chain = normalizeChainHint(chainHint);
  // LEGACY COMPATIBILITY:
  // Unknown EVM chain hints currently fall back to Ethereum. This behavior is intentionally
  // preserved only during Checkpoint B and must be removed with database-backed resolution.
  const identity = (chain && EVM20_IDENTITIES[chain]) || EVM20_IDENTITIES.ethereum;

  return success({
    chainCode: identity.chainCode,
    addressFamily: normalized.addressFamily,
    rawAddress,
    normalizedAddress: normalized.canonicalText,
    prefixCode: identity.prefixCode,
    namespaceId: identity.namespaceId,
    addressCodecId: 1,
    payloadHex: normalized.payloadHex,
  });
}

function normalizeBtcBase58(rawAddress: string): NormalizedAddress | null {
  const p2pkh = normalizeWithCodec(bitcoinP2pkhCodec, rawAddress);
  if (p2pkh) {
    return success({
      chainCode: "btc",
      addressFamily: p2pkh.addressFamily,
      rawAddress,
      normalizedAddress: p2pkh.canonicalText,
      prefixCode: 0x0010,
      namespaceId: 1,
      addressCodecId: 10,
      payloadHex: p2pkh.payloadHex,
    });
  }

  const p2sh = normalizeWithCodec(bitcoinP2shCodec, rawAddress);
  if (p2sh) {
    return success({
      chainCode: "btc",
      addressFamily: p2sh.addressFamily,
      rawAddress,
      normalizedAddress: p2sh.canonicalText,
      prefixCode: 0x0011,
      namespaceId: 2,
      addressCodecId: 11,
      payloadHex: p2sh.payloadHex,
    });
  }

  return null;
}

function normalizeBtcBech32(rawAddress: string): NormalizedAddress | null {
  const normalized = normalizeWithCodec(bitcoinBech32Codec, rawAddress) ?? normalizeWithCodec(bitcoinBech32mCodec, rawAddress);
  if (!normalized) return null;
  const witnessVersion = Number.parseInt(normalized.payloadHex.slice(0, 2), 16);

  return success({
    chainCode: "btc",
    addressFamily: normalized.addressFamily,
    rawAddress,
    normalizedAddress: normalized.canonicalText,
    prefixCode: 0x0012,
    namespaceId: witnessVersion === 0 ? 3 : 47,
    addressCodecId: witnessVersion === 0 ? 12 : 13,
    payloadHex: normalized.payloadHex,
  });
}

function normalizeSolana(rawAddress: string): NormalizedAddress | null {
  const normalized = normalizeWithCodec(solanaBase58Codec, rawAddress, true);
  if (!normalized) return null;

  return success({
    chainCode: "solana",
    addressFamily: normalized.addressFamily,
    rawAddress,
    normalizedAddress: normalized.canonicalText,
    prefixCode: 0x0301,
    namespaceId: 10,
    addressCodecId: 20,
    payloadHex: normalized.payloadHex,
  });
}

function normalizeTron(rawAddress: string): NormalizedAddress | null {
  const normalized = normalizeWithCodec(tronBase58CheckCodec, rawAddress);
  if (!normalized) return null;

  return success({
    chainCode: "tron",
    addressFamily: normalized.addressFamily,
    rawAddress,
    normalizedAddress: normalized.canonicalText,
    prefixCode: 0x0401,
    namespaceId: 11,
    addressCodecId: 21,
    payloadHex: normalized.payloadHex,
  });
}

export function normalizeAddress(rawAddress: string, chainHint?: string | null): NormalizedAddress {
  const value = rawAddress.trim();
  const chain = normalizeChainHint(chainHint);

  if (!value) {
    return failure(rawAddress, "empty_address");
  }

  if (chain && EVM20_IDENTITIES[chain]) {
    return normalizeEvm(value, chain) ?? failure(rawAddress, "invalid_evm_address");
  }

  if (chain === "btc" || chain === "bitcoin") {
    return normalizeBtcBech32(value) ?? normalizeBtcBase58(value) ?? failure(rawAddress, "invalid_btc_address");
  }

  if (chain === "solana") {
    return normalizeSolana(value) ?? failure(rawAddress, "invalid_solana_address");
  }

  if (chain === "tron") {
    return normalizeTron(value) ?? failure(rawAddress, "invalid_tron_address");
  }

  return (
    normalizeEvm(value, chain) ??
    normalizeBtcBech32(value) ??
    normalizeBtcBase58(value) ??
    normalizeTron(value) ??
    normalizeSolana(value) ??
    failure(rawAddress, "unsupported_or_invalid_address")
  );
}
