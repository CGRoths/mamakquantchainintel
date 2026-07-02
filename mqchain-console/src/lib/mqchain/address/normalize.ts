import { createHash } from "crypto";

import type { NormalizedAddress } from "../types";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BECH32_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;
const EVM_CHAIN_PREFIX: Record<string, number> = {
  ethereum: 0x0101,
  eth: 0x0101,
  polygon: 0x0102,
  base: 0x0103,
  arbitrum: 0x0104,
  optimism: 0x0105,
  bsc: 0x0106,
};

function sha256(buffer: Uint8Array) {
  return createHash("sha256").update(buffer).digest();
}

function bytesToHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("hex");
}

function bech32Polymod(values: number[]) {
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;

  for (const value of values) {
    const top = checksum >> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < generator.length; index += 1) {
      if (((top >> index) & 1) === 1) {
        checksum ^= generator[index];
      }
    }
  }

  return checksum;
}

function expandBech32Hrp(hrp: string) {
  return [
    ...Array.from(hrp, (char) => char.charCodeAt(0) >> 5),
    0,
    ...Array.from(hrp, (char) => char.charCodeAt(0) & 31),
  ];
}

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean) {
  let accumulator = 0;
  let bits = 0;
  const maxValue = (1 << toBits) - 1;
  const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1;
  const result: number[] = [];

  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) {
      return null;
    }
    accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((accumulator >> bits) & maxValue);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push((accumulator << (toBits - bits)) & maxValue);
    }
  } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue) !== 0) {
    return null;
  }

  return result;
}

function decodeBase58(value: string) {
  const base = BigInt(58);
  const byteMask = BigInt(255);
  const byteSize = BigInt(8);
  let decoded = BigInt(0);

  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit === -1) {
      return null;
    }
    decoded = decoded * base + BigInt(digit);
  }

  const bytes: number[] = [];
  while (decoded > BigInt(0)) {
    bytes.unshift(Number(decoded & byteMask));
    decoded >>= byteSize;
  }

  for (const char of value) {
    if (char !== "1") {
      break;
    }
    bytes.unshift(0);
  }

  return Uint8Array.from(bytes);
}

function decodeBase58Check(value: string) {
  const decoded = decodeBase58(value);
  if (!decoded || decoded.length < 5) {
    return null;
  }

  const payload = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  const expected = sha256(sha256(payload)).slice(0, 4);

  if (!Buffer.from(checksum).equals(Buffer.from(expected))) {
    return null;
  }

  return payload;
}

function decodeBech32(value: string) {
  if (value.length < 8 || value.length > 90) {
    return null;
  }

  const lower = value.toLowerCase();
  const upper = value.toUpperCase();
  if (value !== lower && value !== upper) {
    return null;
  }

  const separator = lower.lastIndexOf("1");
  if (separator < 1 || separator + 7 > lower.length) {
    return null;
  }

  const hrp = lower.slice(0, separator);
  const data = lower
    .slice(separator + 1)
    .split("")
    .map((char) => BECH32_ALPHABET.indexOf(char));

  if (data.some((digit) => digit === -1)) {
    return null;
  }

  const polymod = bech32Polymod([...expandBech32Hrp(hrp), ...data]);
  const encoding = polymod === BECH32_CONST ? "bech32" : polymod === BECH32M_CONST ? "bech32m" : null;
  if (!encoding) {
    return null;
  }

  return {
    hrp,
    encoding,
    data: data.slice(0, -6),
  };
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
    payloadHex: null,
    isValid: false,
    error,
  };
}

function normalizeEvm(rawAddress: string, chainHint?: string | null): NormalizedAddress | null {
  const value = rawAddress.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return null;
  }

  const chain = normalizeChainHint(chainHint);
  const chainCode = chain && EVM_CHAIN_PREFIX[chain] ? (chain === "eth" ? "ethereum" : chain) : "ethereum";
  const prefixCode = EVM_CHAIN_PREFIX[chainCode] ?? 0x0101;
  const normalizedAddress = value.toLowerCase();

  return success({
    chainCode,
    addressFamily: "evm20",
    rawAddress,
    normalizedAddress,
    prefixCode,
    payloadHex: normalizedAddress.slice(2),
  });
}

function normalizeBtcBase58(rawAddress: string): NormalizedAddress | null {
  const value = rawAddress.trim();
  const payload = decodeBase58Check(value);
  if (!payload || payload.length !== 21) {
    return null;
  }

  const version = payload[0];
  if (version === 0x00) {
    return success({
      chainCode: "btc",
      addressFamily: "btc_p2pkh",
      rawAddress,
      normalizedAddress: value,
      prefixCode: 0x0010,
      payloadHex: bytesToHex(payload),
    });
  }

  if (version === 0x05) {
    return success({
      chainCode: "btc",
      addressFamily: "btc_p2sh",
      rawAddress,
      normalizedAddress: value,
      prefixCode: 0x0011,
      payloadHex: bytesToHex(payload),
    });
  }

  return null;
}

function normalizeBtcBech32(rawAddress: string): NormalizedAddress | null {
  const value = rawAddress.trim();
  const decoded = decodeBech32(value);
  if (!decoded || decoded.hrp !== "bc" || decoded.data.length < 1) {
    return null;
  }
  const witnessVersion = decoded.data[0];
  const program = convertBits(decoded.data.slice(1), 5, 8, false);

  if (
    witnessVersion > 16 ||
    !program ||
    program.length < 2 ||
    program.length > 40 ||
    (witnessVersion === 0 && decoded.encoding !== "bech32") ||
    (witnessVersion > 0 && decoded.encoding !== "bech32m") ||
    (witnessVersion === 0 && program.length !== 20 && program.length !== 32)
  ) {
    return null;
  }

  const payload = Uint8Array.from([witnessVersion, ...program]);

  return success({
    chainCode: "btc",
    addressFamily: "btc_bech32",
    rawAddress,
    normalizedAddress: value.toLowerCase(),
    prefixCode: 0x0012,
    payloadHex: bytesToHex(payload),
  });
}

function normalizeSolana(rawAddress: string): NormalizedAddress | null {
  const value = rawAddress.trim();
  const decoded = decodeBase58(value);
  if (!decoded || decoded.length !== 32) {
    return null;
  }

  return success({
    chainCode: "solana",
    addressFamily: "solana32",
    rawAddress,
    normalizedAddress: value,
    prefixCode: 0x0301,
    payloadHex: bytesToHex(decoded),
  });
}

function normalizeTron(rawAddress: string): NormalizedAddress | null {
  const value = rawAddress.trim();
  const payload = decodeBase58Check(value);
  if (!payload || payload.length !== 21 || payload[0] !== 0x41) {
    return null;
  }

  return success({
    chainCode: "tron",
    addressFamily: "tron21",
    rawAddress,
    normalizedAddress: value,
    prefixCode: 0x0401,
    payloadHex: bytesToHex(payload),
  });
}

export function normalizeAddress(rawAddress: string, chainHint?: string | null): NormalizedAddress {
  const value = rawAddress.trim();
  const chain = normalizeChainHint(chainHint);

  if (!value) {
    return failure(rawAddress, "empty_address");
  }

  if (chain && (EVM_CHAIN_PREFIX[chain] || chain === "ethereum")) {
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
