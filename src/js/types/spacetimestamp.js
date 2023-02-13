import {
  bigIntToBytes,
  bytesToBigInt,
  spreadBits,
  unspreadBits,
} from "./util.js";

function spacetimestampEncoder(v, b) {
  const { t, x, y, z } = v;
  if (t > 0xffffffffffffffffn) {
    throw Error(
      "Error encoding spacetimestamp: Not in valid range: 0 <= t <= 2^64-1.",
    );
  }
  if (x > 0xffffffffffffffffn) {
    throw Error(
      "Error encoding spacetimestamp: Not in valid range: 0 <= x <= 2^64-1.",
    );
  }
  if (y > 0xffffffffffffffffn) {
    throw Error(
      "Error encoding spacetimestamp: Not in valid range: 0 <= y <= 2^64-1.",
    );
  }
  if (z > 0xffffffffffffffffn) {
    throw Error(
      "Error encoding spacetimestamp: Not in valid range: 0 <= z <= 2^64-1.",
    );
  }
  const xyz = (spreadBits(x) << 2n) | (spreadBits(y) << 1n) | spreadBits(z);
  bigIntToBytes(t, b, 0, 8);
  bigIntToBytes(xyz, b, 8, 24);
  return null;
}

function spacetimestampDecoder(b, blob) {
  const t = bytesToBigInt(b, 0, 8);
  const xyz = bytesToBigInt(b, 8, 24);
  const x = unspreadBits(xyz >> 2n);
  const y = unspreadBits(xyz >> 1n);
  const z = unspreadBits(xyz);

  return { t, x, y, z };
}

export const schema = {
  encoder: spacetimestampEncoder,
  decoder: spacetimestampDecoder,
};
