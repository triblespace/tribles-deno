import { Schema } from "../schemas.ts";
import { Value, Blob, LazyBlob } from "../trible.ts";
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

function encodeValue(v: Spacetimestamp, b: Value): Blob | undefined {
  const { t = 0n, x = 0n, y = 0n, z = 0n } = v;
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

function decodeValue(b: Value, _blob: LazyBlob): Spacetimestamp {
  const t = bytesToBigInt(b, 0, 8);
  const zyx = bytesToBigInt(b, 8, 24);
  const z = unspreadBits(zyx >> 2n);
  const y = unspreadBits(zyx >> 1n);
  const x = unspreadBits(zyx);

  return { t, x, y, z };
}

export const schema: Schema<Spacetimestamp> = {
  encodeValue,
  decodeValue
};
