import { Schema } from "../schemas.ts";
import { Blob, LazyBlob, Value } from "../trible.ts";
import { bigIntToBytes, bytesToBigInt } from "./util.ts";

function encodeValue(v: bigint, b: Value): Blob | undefined {
  if (
    v >= (1n << 256n) ||
    v < 0n
  ) {
    throw Error("Error BigInt not in valid range: 0 <= v <= 2^256-1.");
  }
  bigIntToBytes(v, b, 0, 32);
  return undefined;
}

function decodeValue(b: Value, _blob: LazyBlob): bigint {
  return bytesToBigInt(b, 0, 32);
}

export const schema: Schema<bigint> = {
  encodeValue,
  decodeValue,
};
