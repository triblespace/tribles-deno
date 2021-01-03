const { uuidType } = require("./types/uuid.js");
const { shortstringType } = require("./types/shortstring.js");
const { longstringType } = require("./types/longstring.js");
const { spacetimestampType } = require("./types/spacetimestamp.js");
const { biguint256Type } = require("./types/biguint256.js");
const { float64Type } = require("./types/float64.js");

const types = {
  uuid: uuidType,
  shortstring: shortstringType,
  longstring: longstringType,
  spacetimestamp: spacetimestampType,
  biguint256: biguint256Type,
  //float64: float64Type, //TODO Fix to use lexicographical sorting.
};

module.exports = { types };
