import { Schema } from "../schemas.ts";
import { Blob, LazyBlob, Value } from "../trible.ts";

type Geostamp = {
  timestamp: number;
  altitude: number;
  latitude: number;
  longitude: number;
};

function encodeValue(v: Geostamp, b: Value): Blob | undefined {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setFloat64(0, v.timestamp);
  view.setFloat64(8, v.altitude);
  view.setFloat64(16, v.latitude);
  view.setFloat64(24, v.longitude);
  return undefined;
}

function decodeValue(b: Value, _blob: LazyBlob): Geostamp {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const timestamp = view.getFloat64(0);
  const altitude = view.getFloat64(8);
  const latitude = view.getFloat64(16);
  const longitude = view.getFloat64(24);

  return { timestamp, altitude, latitude, longitude };
}

export const schema: Schema<Geostamp> = {
  encodeValue,
  decodeValue,
};
