import { schema as ufoid_schema } from "./types/ufoid.js";
import { schema as uuid_schema } from "./types/uuid.js";
import { schema as shortstring_schema } from "./types/shortstring.js";
import { schema as longstring_schema } from "./types/longstring.js";
import { schema as spacetimestamp_schema } from "./types/spacetimestamp.js";
import { schema as subrange_schema } from "./types/subrange.js";
import { schema as biguint256_schema } from "./types/biguint256.js";
import { schema as bigint256_schema } from "./types/bigint256.js";
import { schema as hex_schema } from "./types/hex.js";
import { schema as rgba_schema } from "./types/rgba.js";

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
