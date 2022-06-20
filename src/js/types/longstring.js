import { blake2b256 } from "../wasm.js";

function longstringEncoder(v, b) {
  const d = new TextEncoder("utf-8").encode(v);
  blake2b256(d, b);
  return d;
}

async function longstringDecoder(b, blob) {
  return new TextDecoder("utf-8").decode(await blob());
}

const longstring = {
  encoder: longstringEncoder,
  decoder: longstringDecoder,
};

export { longstring };
