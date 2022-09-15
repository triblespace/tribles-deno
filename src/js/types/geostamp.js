import { bigIntToBytes, bytesToBigInt, spreadBits, unspreadBits } from "./util.js";

function geostampEncoder(v, b) {
  const view = new DataView(v.buffer, v.byteOffset, v.byteLength);
  view.setFloat64(0, v.timestamp);
  view.setFloat64(8, v.altitude);
  view.setFloat64(16, v.latitude);
  view.setFloat64(24, v.longitude);
  return null;
}

function geostampDecoder(b, blob) {
  const t = bytesToBigInt(b, 0, 8);
  const xyz = bytesToBigInt(b, 8, 24);
  const x = unspreadBits(xyz >> 2n);
  const y = unspreadBits(xyz >> 1n);
  const z = unspreadBits(xyz);

  const view = new DataView(v.buffer, v.byteOffset, v.byteLength);
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
