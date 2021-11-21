import { UFOID } from "../ufoid.js";

function ufoidEncoder(v, b) {
  if (!UFOID.validate(v)) {
    throw Error(`Provided value is not an encodable ufoid:${v}`);
  }
  b.fill(0, 0, b.length - 16);
  b.set(v, b.length - 16);
  return null;
}

function ufoidDecoder(b, blob) {
  return b.subarray(b.length - 16);
}

export const ufoid = {
  encoder: ufoidEncoder,
  decoder: ufoidDecoder,
  factory: UFOID.now,
};
