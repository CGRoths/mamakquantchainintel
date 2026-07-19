const BECH32_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values: number[]) {
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;

  for (const value of values) {
    const top = checksum >> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < generator.length; index += 1) {
      if (((top >> index) & 1) === 1) checksum ^= generator[index];
    }
  }

  return checksum;
}

function expandBech32Hrp(hrp: string) {
  return [
    ...Array.from(hrp, char => char.charCodeAt(0) >> 5),
    0,
    ...Array.from(hrp, char => char.charCodeAt(0) & 31),
  ];
}

export function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean) {
  let accumulator = 0;
  let bits = 0;
  const maxValue = (1 << toBits) - 1;
  const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1;
  const result: number[] = [];

  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) return null;
    accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((accumulator >> bits) & maxValue);
    }
  }

  if (pad) {
    if (bits > 0) result.push((accumulator << (toBits - bits)) & maxValue);
  } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue) !== 0) {
    return null;
  }

  return result;
}

export function decodeBech32(value: string) {
  if (value.length < 8 || value.length > 90) return null;

  const lower = value.toLowerCase();
  const upper = value.toUpperCase();
  if (value !== lower && value !== upper) return null;

  const separator = lower.lastIndexOf("1");
  if (separator < 1 || separator + 7 > lower.length) return null;

  const hrp = lower.slice(0, separator);
  const data = lower.slice(separator + 1).split("").map(char => BECH32_ALPHABET.indexOf(char));
  if (data.some(digit => digit === -1)) return null;

  const polymod = bech32Polymod([...expandBech32Hrp(hrp), ...data]);
  const encoding = polymod === BECH32_CONST ? "bech32" : polymod === BECH32M_CONST ? "bech32m" : null;
  if (!encoding) return null;

  return { hrp, encoding, data: data.slice(0, -6) } as const;
}
