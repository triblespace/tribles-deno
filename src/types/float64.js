//TODO: The encoding should be consistent with lexicographical
// sorting. See: https://stackoverflow.com/questions/43299299/sorting-floating-point-values-using-their-byte-representation

function float64Encoder(v, b) {
  new DataView(b.buffer, b.byteOffset, b.byteLength).setFloat64(0, v, false);
  return null;
}

function float64Decoder(b, blob) {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(
    0,
    false
  );
}

const float64Type = {
  encoder: float64Encoder,
  decoder: float64Decoder,
};

module.exports = { float64Type };
