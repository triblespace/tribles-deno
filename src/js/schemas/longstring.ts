import { Schema } from "../schemas.ts";
import { Value, Blob, LazyBlob } from "../trible.ts";
import { blake3 } from "../wasm.js";

function encodeValue(v: string, b: Value): Blob {
  const d = new TextEncoder().encode(v);
  b.set(blake3(d));
  return d;
}

async function decodeValue(_b: Value, blob: LazyBlob): Promise<string> {
  return new TextDecoder().decode(await blob());
}

export const schema: Schema<string> = {
  encodeValue,
  decodeValue,
};
