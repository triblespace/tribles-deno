const { bigIntToBytes, bytesToBigInt } = require("./util.js");

function biguint256Encoder(v, b) {
  if (
    v >
      BigInt(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      ) ||
    v < BigInt("0")
  ) {
    throw Error("Error BigInt not in valid range: 0 <= v <= 2^256-1.");
  }
  bigIntToBytes(v, b, 0, 32);
  return null;
}

function biguint256Decoder(b, blob) {
  return bytesToBigInt(b, 0, 32);
}

const biguint256 = {
  encoder: biguint256Encoder,
  decoder: biguint256Decoder,
};

module.exports = { biguint256 };
