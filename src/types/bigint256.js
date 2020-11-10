import { bigIntToBytes, bytesToBigInt } from "./util.js";

function bigint256_encoder(v, b) {
  if (
    v > 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn ||
    v < 0n
  ) {
    throw Error(
      "Error BigInt not in valid range: 0 <= v <= 2^256-1.",
    );
  }
  bigIntToBytes(v, b, 0, 32);
  return null;
}

function bigint256_decoder(b, blob) {
  return bytesToBigInt(b, 0, 32);
}

const bigint256 = ({
  encoder: bigint256_encoder,
  decoder: bigint256_decoder,
});

export { bigint256 };
