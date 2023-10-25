// See: https://docs.rs/ultraviolet/latest/ultraviolet/transform/struct.Similarity3.html

import { Schema } from "../schemas.ts";
import { Blob, LazyBlob, Value } from "../trible.ts";

type Similarty3d32 = {
  translation: { x: number; y: number; z: number };
  rotation: { s: number; bv: { xy: number; xz: number; yz: number } };
  scale: number;
};

function encodeValue(v: Similarty3d32, b: Value): Blob | undefined {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setFloat32(0, v.translation.x);
  view.setFloat32(4, v.translation.y);
  view.setFloat32(8, v.translation.z);
  view.setFloat32(12, v.rotation.s);
  view.setFloat32(16, v.rotation.bv.xy);
  view.setFloat32(20, v.rotation.bv.xz);
  view.setFloat32(24, v.rotation.bv.yz);
  view.setFloat32(28, v.scale);

  return undefined;
}

function decodeValue(b: Value, _blob: LazyBlob): Similarty3d32 {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const x = view.getFloat32(0);
  const y = view.getFloat32(4);
  const z = view.getFloat32(8);
  const s = view.getFloat32(12);
  const xy = view.getFloat32(16);
  const xz = view.getFloat32(20);
  const yz = view.getFloat32(24);
  const scale = view.getFloat32(28);

  return {
    translation: { x, y, z },
    rotation: { s, bv: { xy, xz, yz } },
    scale,
  };
}

export const schema: Schema<Similarty3d32> = {
  encodeValue,
  decodeValue,
};
