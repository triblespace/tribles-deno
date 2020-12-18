import { bigIntToBytes, bytesToBigInt } from "./util.js";

function biguint256Encoder(v, b) {
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

function biguint256Decoder(b, blob) {
  return bytesToBigInt(b, 0, 32);
}

const biguint256 = ({
  encoder: biguint256Encoder,
  decoder: biguint256Decoder,
});

export { biguint256 };
