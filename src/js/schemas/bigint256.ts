import { Schema } from "../schemas.ts";
import { Value, Blob, LazyBlob } from "../trible.ts";
import { bigIntToBytes, bytesToBigInt } from "./util.ts";

function encodeValue(v: bigint, b: Value): Blob | undefined {
  if (
    v >= (1n << 255n) ||
    v < -(1n << 255n)
  ) {
    throw Error("Error BigInt not in valid range: -2^255 <= v < 2^255.");
  }
  bigIntToBytes(BigInt(v) + (1n << 255n), b, 0, 32);
  return undefined;
}

function decodeValue(b: Value, _blob: LazyBlob): bigint {
  return bytesToBigInt(b, 0, 32) - (1n << 255n);
}

export const schema: Schema<bigint> = {
  encodeValue,
  decodeValue,
};
