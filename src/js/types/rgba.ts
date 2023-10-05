function rgbaEncoder({ r = 0, g = 0, b = 0, a = 1 }, buff) {
  const view = new DataView(buff.buffer, buff.byteOffset, buff.byteLength);
  view.setFloat64(0, a);
  view.setFloat64(8, r);
  view.setFloat64(16, g);
  view.setFloat64(24, b);
  return null;
}

function rgbaDecoder(buff, blob) {
  const view = new DataView(buff.buffer, buff.byteOffset, buff.byteLength);
  const a = view.getFloat64(0);
  const r = view.getFloat64(8);
  const g = view.getFloat64(16);
  const b = view.getFloat64(24);

  return { r, g, b, a };
}

export const schema = {
  encoder: rgbaEncoder,
  decoder: rgbaDecoder,
};
