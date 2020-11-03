import { blake2s32 } from "../blake2s.js";

const longstring = ({
  encoder: (v, b) => {
    let d = new TextEncoder("utf-8").encode(v);
    blake2s32(d, b);
    return d;
  },
  decoder: (b, blob) => {
    return new TextDecoder("utf-8").decode(blob());
  },
});

export { longstring };
