import { Schema } from "../schemas.ts";
import { Value, Blob, LazyBlob } from "../trible.ts";

function encodeValue(v: string, b: Value): Blob | undefined {
  const d = new TextEncoder().encode(v);
  if (d.length > 32) {
    throw Error("String is too long for encoding.");
  }
  for (let i = 0; i < 32; i++) {
    if (i < d.byteLength) {
      b[i] = d[i];
    } else {
      b[i] = 0;
    }
  }
  return undefined;
}

function decodeValue(b: Value, _blob: LazyBlob): string {
  const i = b.indexOf(0);

  let shortened_b: Uint8Array = b;
  if (i !== -1) {
    shortened_b = b.subarray(0, i);
  }
  return new TextDecoder().decode(shortened_b);
}

export const schema: Schema<string> = {
  encodeValue,
  decodeValue,
};
