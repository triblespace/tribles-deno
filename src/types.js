import { uuidType } from "./types/uuid.js";
import { shortstringType } from "./types/shortstring.js";
import { longstringType } from "./types/longstring.js";
import { spacetimestampType } from "./types/spacetimestamp.js";
import { biguint256Type } from "./types/biguint256.js";
import { float64Type } from "./types/float64.js";

const types = {
  uuid: uuidType,
  shortstring: shortstringType,
  longstring: longstringType,
  spacetimestamp: spacetimestampType,
  biguint256: biguint256Type,
  //float64: float64Type, //TODO Fix to use lexicographical sorting.
};

export { types };
