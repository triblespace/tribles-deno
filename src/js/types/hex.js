import {
  decodeString,
  encodeToString,
} from "https://deno.land/std@0.93.0/encoding/hex.ts";

function hexEncoder(v, b) {
  if (v.length !== 64) {
    throw Error(
      "Couldn't encode hex value: Length must be exactly 64 (left padded with 0s)."
    );
  }
  const bytes = decodeString(v);
  for (let i = 0; i < bytes.length - b.length; i++) {
    if (bytes[i] !== 0) {
      throw Error(
        "Couldn't encode hex value as id: Too large non zero prefix."
      );
    }
  }
  b.fill(0);
  b.set(bytes.subarray(bytes.length - b.length));
  return null;
}

function hexDecoder(b, blob) {
  return encodeToString(b).padStart(64, "0");
}

function hexFactory() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes.subarray(16, 32));
  return encodeToString(bytes).padStart(64, "0");
}

const hex = {
  encoder: hexEncoder,
  decoder: hexDecoder,
  factory: hexFactory,
};

export { hex };
