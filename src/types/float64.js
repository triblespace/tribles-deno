//TODO: The encoding should be consistent with lexicographical
// sorting. See: https://stackoverflow.com/questions/43299299/sorting-floating-point-values-using-their-byte-representation

function float64_encoder(v, b) {
  new DataView(b.buffer, b.byteOffset, b.byteLength).setFloat64(0, v, false);
  return null;
}

function float64_decoder(b, blobfn) {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(
    0,
    false,
  );
}

const float64 = {
  encoder: float64_encoder,
  decoder: float64_decoder,
};

export { float64 };
