import {
  bytesToUuid,
  uuidToBytes,
} from "https://deno.land/std@0.180.0/uuid/_common.ts";
import { NIL_UUID, v4 } from "https://deno.land/std@0.180.0/uuid/mod.ts";
import { VALUE_SIZE } from "../trible.ts";
import { FixedUint8Array } from "../util.ts";

function encodeValue(v: string, b: FixedUint8Array<typeof VALUE_SIZE>): undefined | Blob {
  if (!v4.validate(v)) {
    throw Error("Provided value is not an encodable uuid.");
  }
  if (v === NIL_UUID) {
    throw Error("Can't encode NIL uuid.");
  }
  b.fill(0, 0, b.length - 16);
  b.set(uuidToBytes(v), b.length - 16);
  return undefined;
}

function decodeValue(b: FixedUint8Array<typeof VALUE_SIZE>, _blob: Blob): string {
  const a = new Uint32Array(b.buffer, b.byteOffset, 8);
  if (
    a[0] !== 0 ||
    a[1] !== 0 ||
    a[2] !== 0 ||
    a[3] !== 0
  ) {
    throw Error("invalid uuid: value must be zero padded");
  }
  return bytesToUuid(b.subarray(b.length - 16));
}

export const schema = {
  encodeValue,
  decodeValue,
};
