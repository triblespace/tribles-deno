function subrangeEncoder(v, b) {
  const view = new DataView(v.buffer, v.byteOffset, v.byteLength);
  view.setBigUint64(0, v.range_start);
  view.setBigUint64(8, v.range_end);
  view.setBigUint64(16, v.start);
  view.setBigUint64(24, v.end);
  return null;
}

function subrangeDecoder(b, blob) {
  const view = new DataView(v.buffer, v.byteOffset, v.byteLength);
  const range_start = view.getBigUint64(0, v.range_start);
  const range_end = view.setBigUint64(8, v.range_end);
  const start = view.setBigUint64(16, v.start);
  const end = view.setBigUint64(24, v.end);

  return { range_start, range_end, start, end };
}

export const schema = {
  encoder: subrangeEncoder,
  decoder: subrangeDecoder,
};
