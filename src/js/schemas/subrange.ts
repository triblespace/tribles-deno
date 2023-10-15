import { Schema } from "../schemas.ts";
import { Value, Blob, LazyBlob } from "../trible.ts";

type Subrange = {range_start: bigint,
                 range_end: bigint,
                 sub_start: bigint,
                 sub_end: bigint};

function encodeValue(v: Subrange , b: Value): Blob | undefined {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setBigUint64(0, v.range_start);
  view.setBigUint64(8, v.range_end);
  view.setBigUint64(16, v.sub_start);
  view.setBigUint64(24, v.sub_end);
  return undefined;
}

function decodeValue(b: Value, _blob: LazyBlob): Subrange {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const range_start = view.getBigUint64(0);
  const range_end = view.getBigUint64(8);
  const sub_start = view.getBigUint64(16);
  const sub_end = view.getBigUint64(24);

  return { range_start, range_end, sub_start, sub_end };
}

export const schema: Schema<Subrange> = {
  encodeValue,
  decodeValue,
};
