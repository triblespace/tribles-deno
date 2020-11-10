import { bigIntToBytes, bytesToBigInt } from "./util.js";

function biguint256_encoder(v, b) {
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

function biguint256_decoder(b, blob) {
  return bytesToBigInt(b, 0, 32);
}

const biguint256 = ({
  encoder: biguint256_encoder,
  decoder: biguint256_decoder,
});

export { biguint256 };
