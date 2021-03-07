import {
  bytesToUuid,
  uuidToBytes,
} from "https://deno.land/std@0.78.0/uuid/_common.ts";
import { NIL_UUID, v4 } from "https://deno.land/std@0.78.0/uuid/mod.ts";

function uuidEncoder(v, b) {
  if (!v4.validate(v)) {
    throw Error("Provided value is not an encodable uuid.");
  }
  if (v === NIL_UUID) {
    throw Error("Can't encode NIL uuid.");
  }
  b.fill(0, 16, b.length);
  b.set(uuidToBytes(v));
  return null;
}

function uuidDecoder(b, blob) {
  return bytesToUuid(b.subarray(0, 16));
}

const uuid = ({
  encoder: uuidEncoder,
  decoder: uuidDecoder,
});

export { uuid };
