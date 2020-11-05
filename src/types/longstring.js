import { blake2s32 } from "../blake2s.js";

function longstring_encoder(v, b) {
  let d = new TextEncoder("utf-8").encode(v);
  blake2s32(d, b);
  return d;
}

function longstring_decoder(b, blob) {
  return new TextDecoder("utf-8").decode(blob());
}

const longstring = ({
  encoder: longstring_encoder,
  decoder: longstring_decoder,
});

export { longstring };
