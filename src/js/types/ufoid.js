import { UFOID } from "../ufoid.js";

function ufoidEncoder(v, b) {
  if (!UFOID.validate(v)) {
    throw Error(`Provided value is not an encodable ufoid:${v}`);
  }
  b.set(v);
  return null;
}

function ufoidDecoder(b, blob) {
  return b;
}

export const ufoid = {
  encoder: ufoidEncoder,
  decoder: ufoidDecoder,
  factory: UFOID.now,
};
