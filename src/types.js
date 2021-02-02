import { ufoid } from "./types/ufoid.js";
import { uuid } from "./types/uuid.js";
import { shortstring } from "./types/shortstring.js";
import { longstring } from "./types/longstring.js";
import { spacetimestamp } from "./types/spacetimestamp.js";
import { biguint256 } from "./types/biguint256.js";
import { float64 } from "./types/float64.js";

export const types = {
  ufoid,
  uuid,
  shortstring,
  longstring,
  spacetimestamp,
  biguint256,
  //float64, //TODO Fix to use lexicographical sorting.
};
