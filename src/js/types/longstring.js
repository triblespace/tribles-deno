import { blake3 } from "../wasm.js";

function longstringEncoder(v, b) {
  const d = new TextEncoder("utf-8").encode(v);
  blake3(d, b);
  return d;
}

async function longstringDecoder(b, blob) {
  return new TextDecoder("utf-8").decode(await blob());
}

export const schema = {
  encoder: longstringEncoder,
  decoder: longstringDecoder,
};
