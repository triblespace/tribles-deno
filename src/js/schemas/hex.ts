import * as hex from "https://deno.land/std@0.180.0/encoding/hex.ts";
import { Schema } from "../schemas.ts";
import { LazyBlob, Value, Blob } from "../trible.ts";

function encodeValue(v: string, b: Value): Blob | undefined {
  if (v.length !== 64) {
    throw Error(
      "Couldn't encode hex value: Length must be exactly 64 (left padded with 0s).",
    );
  }
  const bytes = hex.decode(new TextEncoder().encode(v));
  for (let i = 0; i < bytes.length - b.length; i++) {
    if (bytes[i] !== 0) {
      throw Error(
        "Couldn't encode hex value as id: Too large non zero prefix.",
      );
    }
  }
  b.fill(0);
  b.set(bytes.subarray(bytes.length - b.length));
  return undefined;
}

function decodeValue(b: Value, _blob: LazyBlob) {
  return new TextDecoder().decode(hex.encode(b)).padStart(64, "0");
}

export const schema: Schema<string> = {
  encodeValue,
  decodeValue,
};
