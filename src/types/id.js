import {
  bytesToUuid,
  uuidToBytes,
} from "https://deno.land/std@0.76.0/uuid/_common.ts";

function id_encoder(v, b) {
  b.fill(0, 0, b.length - 16);
  b.set(uuidToBytes(v), b.length - 16);
  return null;
}

function id_decoder(b, blob) {
  return bytesToUuid(b.subarray(b.length - 16));
}

const id = ({
  encoder: id_encoder,
  decoder: id_decoder,
});

export { id };
