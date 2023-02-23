function geostampEncoder(v, b) {
  const view = new DataView(v.buffer, v.byteOffset, v.byteLength);
  view.setFloat64(0, v.timestamp);
  view.setFloat64(8, v.altitude);
  view.setFloat64(16, v.latitude);
  view.setFloat64(24, v.longitude);
  return null;
}

function geostampDecoder(b, blob) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const timestamp = view.getFloat64(0);
  const altitude = view.getFloat64(8);
  const latitude = view.getFloat64(16);
  const longitude = view.getFloat64(24);

  return { timestamp, altitude, latitude, longitude };
}

export const schema = {
  encoder: geostampEncoder,
  decoder: geostampDecoder,
};
