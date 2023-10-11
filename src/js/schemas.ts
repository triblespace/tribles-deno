import { schema as ufoid_schema } from "./schemas/ufoid.ts";
import { schema as uuid_schema } from "./schemas/uuid.ts";
import { schema as shortstring_schema } from "./schemas/shortstring.ts";
import { schema as longstring_schema } from "./schemas/longstring.ts";
import { schema as spacetimestamp_schema } from "./schemas/spacetimestamp.ts";
import { schema as subrange_schema } from "./schemas/subrange.ts";
import { schema as biguint256_schema } from "./schemas/biguint256.ts";
import { schema as bigint256_schema } from "./schemas/bigint256.ts";
import { schema as hex_schema } from "./schemas/hex.ts";
import { schema as rgba_schema } from "./schemas/rgba.ts";
import { schema as geostamp_schema } from "./schemas/geostamp.ts";
import { Id, Value, Blob } from "./trible.ts";

export interface Schema<T> {
  encodeValue(value: T, buffer: Value): Blob | undefined;
  decodeValue(bytes: Value, blob: Blob): T;
}

export interface IdSchema<T> extends Schema<T> {
  encodeId(value: T, buffer: Id): Blob | undefined;
  decodeId(bytes: Value, blob: Blob): T;
  factory(): T;
}

export const schemas = {
  ufoid: ufoid_schema,
  uuid: uuid_schema,
  shortstring: shortstring_schema,
  longstring: longstring_schema,
  spacetimestamp: spacetimestamp_schema,
  geostamp: geostamp_schema,
  subrange: subrange_schema,
  biguint256: biguint256_schema,
  bigint256: bigint256_schema,
  hex: hex_schema,
  rgba: rgba_schema,
};
