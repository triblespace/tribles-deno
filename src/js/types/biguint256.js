import { bigIntToBytes, bytesToBigInt } from "./util.js";

function biguint256Encoder(v, b) {
  if (
    v >= (1n << 256n) ||
    v < 0n
  ) {
    throw Error("Error BigInt not in valid range: 0 <= v <= 2^256-1.");
  }
  bigIntToBytes(v, b, 0, 32);
  return null;
}

function biguint256Decoder(b, blob) {
  return bytesToBigInt(b, 0, 32);
}

export const schema = {
  encoder: biguint256Encoder,
  decoder: biguint256Decoder,
};
