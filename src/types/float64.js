function encode_fload64(v, b) {
  new DataView(b.buffer, b.byteOffset, b.byteLength).setFloat64(0, v, false);
  return null;
}

function decoder_float64(b, blobfn) {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(
    0,
    false,
  );
}

const float64 = {
  encoder: encode_fload64,
  decoder: decoder_float64,
};

export { float64 };
