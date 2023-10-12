import { VALUE_SIZE } from "../trible.ts";
import { FixedUint8Array } from "../util.ts";
import {
  bigIntToBytes,
  bytesToBigInt,
  spreadBits,
  unspreadBits,
} from "./util.ts";

type Spacetimestamp = {
  t: bigint,
  x: bigint,
  y: bigint,
  z: bigint
};

function encodeValue(v: Spacetimestamp, b: FixedUint8Array<typeof VALUE_SIZE>): Blob | undefined {
  const { t = 0, x = 0, y = 0, z = 0 } = v;
  if (t > 0xffffffffffffffffn) {
    throw Error(
      "Error encoding spacetimestamp: Not in valid range: 0 <= t <= 2^64-1.",
    );
  }
  if (z > 0xffffffffffffffffn) {
    throw Error(
      "Error encoding spacetimestamp: Not in valid range: 0 <= z <= 2^64-1.",
    );
  }
  if (y > 0xffffffffffffffffn) {
    throw Error(
      "Error encoding spacetimestamp: Not in valid range: 0 <= y <= 2^64-1.",
    );
  }
  if (x > 0xffffffffffffffffn) {
    throw Error(
      "Error encoding spacetimestamp: Not in valid range: 0 <= x <= 2^64-1.",
    );
  }
  const zyx = (spreadBits(z) << 2n) | (spreadBits(y) << 1n) | spreadBits(x);
  bigIntToBytes(t, b, 0, 8);
  bigIntToBytes(zyx, b, 8, 24);
  return undefined;
}

function decodeValue(b: FixedUint8Array<typeof VALUE_SIZE>, _blob: Blob | undefined): Spacetimestamp {
  const t = bytesToBigInt(b, 0, 8);
  const zyx = bytesToBigInt(b, 8, 24);
  const z = unspreadBits(zyx >> 2n);
  const y = unspreadBits(zyx >> 1n);
  const x = unspreadBits(zyx);

  return { t, x, y, z };
}

export const schema = {
  encodeValue,
  decodeValue
};
