import {
  bytesToUuid,
  uuidToBytes,
} from "https://deno.land/std@0.180.0/uuid/_common.ts";
import { NIL_UUID, v4 } from "https://deno.land/std@0.180.0/uuid/mod.ts";

function uuidEncoder(v, b) {
  if (!v4.validate(v)) {
    throw Error("Provided value is not an encodable uuid.");
  }
  if (v === NIL_UUID) {
    throw Error("Can't encode NIL uuid.");
  }
  b.fill(0, 0, b.length - 16);
  b.set(uuidToBytes(v), b.length - 16);
  return null;
}

function uuidDecoder(b, blob) {
  return bytesToUuid(b.subarray(b.length - 16));
}

export const schema = {
  encoder: uuidEncoder,
  decoder: uuidDecoder,
  factory: v4,
};
