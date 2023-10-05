import { schema as ufoid_schema } from "./types/ufoid.ts";
import { schema as uuid_schema } from "./types/uuid.ts";
import { schema as shortstring_schema } from "./types/shortstring.ts";
import { schema as longstring_schema } from "./types/longstring.ts";
import { schema as spacetimestamp_schema } from "./types/spacetimestamp.ts";
import { schema as subrange_schema } from "./types/subrange.ts";
import { schema as biguint256_schema } from "./types/biguint256.ts";
import { schema as bigint256_schema } from "./types/bigint256.ts";
import { schema as hex_schema } from "./types/hex.ts";
import { schema as rgba_schema } from "./types/rgba.ts";

export const types = {
  ufoid: ufoid_schema,
  uuid: uuid_schema,
  shortstring: shortstring_schema,
  longstring: longstring_schema,
  spacetimestamp: spacetimestamp_schema,
  subrange: subrange_schema,
  biguint256: biguint256_schema,
  bigint256: bigint256_schema,
  hex: hex_schema,
  rgba: rgba_schema,
};
