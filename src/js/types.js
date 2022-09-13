import { schema as ufoid_schema } from "./types/ufoid.js";
import { schema as uuid_schema } from "./types/uuid.js";
import { schema as shortstring_schema } from "./types/shortstring.js";
import { schema as longstring_schema } from "./types/longstring.js";
import { schema as spacetimestamp_schema } from "./types/spacetimestamp.js";
import { schema as biguint256_schema } from "./types/biguint256.js";
import { schema as hex_schema } from "./types/hex.js";
//import { schema as float64_schema } from "./types/float64.js"; //TODO Fix to use lexicographical sorting.


export const types = {
  ufoid: ufoid_schema,
  uuid: uuid_schema,
  shortstring: shortstring_schema,
  longstring: longstring_schema,
  spacetimestamp: spacetimestamp_schema,
  biguint256: biguint256_schema,
  hex: hex_schema,
};
