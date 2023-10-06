import * as hex from "https://deno.land/std@0.180.0/encoding/hex.ts";

function hexEncoder(value, b) {
  if (value.length !== 64) {
    throw Error(
      "Couldn't encode hex value: Length must be exactly 64 (left padded with 0s).",
    );
  }
  const bytes = hex.decode(new TextEncoder().encode(value));
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

function hexDecoder(bytes, blob) {
  return new TextDecoder().decode(hex.encode(bytes)).padStart(64, "0");
}

function hexFactory() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes.subarray(16, 32));
  return new TextDecoder().decode(hex.encode(bytes)).padStart(64, "0");
}

export const schema = {
  encoder: hexEncoder,
  decoder: hexDecoder,
  factory: hexFactory,
};
