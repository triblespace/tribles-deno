import { bigIntToBytes, bytesToBigInt } from "./util.ts";

function bigint256Encoder(v, b) {
  if (
    v >= (1n << 255n) ||
    v < -(1n << 255n)
  ) {
    throw Error("Error BigInt not in valid range: -2^255 <= v < 2^255.");
  }
  bigIntToBytes(BigInt(v) + (1n << 255n), b, 0, 32);
  return null;
}

function bigint256Decoder(b, blob) {
  return bytesToBigInt(b, 0, 32) - (1n << 255n);
}

export const schema = {
  encoder: bigint256Encoder,
  decoder: bigint256Decoder,
};
