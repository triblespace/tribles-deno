// See: https://docs.rs/ultraviolet/latest/ultraviolet/transform/struct.Similarity3.html

function similarity3Encoder(v, b) {
  const view = new DataView(v.buffer, v.byteOffset, v.byteLength);
  view.setFloat32(0, v.translation.x);
  view.setFloat32(4, v.translation.y);
  view.setFloat32(8, v.translation.z);
  view.setFloat32(12, v.rotation.s);
  view.setFloat32(16, v.rotation.bv.xy);
  view.setFloat32(20, v.rotation.bv.xz);
  view.setFloat32(24, v.rotation.bv.yz);
  view.setFloat32(28, v.scale);

  return null;
}

function similarity3Decoder(b, blob) {
  const view = new DataView(v.buffer, v.byteOffset, v.byteLength);
  const x = view.getFloat32(0);
  const y = view.getFloat32(4);
  const z = view.getFloat32(8);
  const s = view.getFloat32(12);
  const xy = view.getFloat32(16);
  const xz = view.getFloat32(20);
  const yz = view.getFloat32(24);
  const scale = view.getFloat32(28);

  return { translation: {x, y, z},
           rotation: {s, bv: {xy, xz, yz}},
           scale };
}

export const schema = { 
  encoder: similarity3Encoder,
  decoder: similarity3Decoder,
};
