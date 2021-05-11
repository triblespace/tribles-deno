const { ufoid } = require("./types/ufoid.js");
const { uuid } = require("./types/uuid.js");
const { shortstring } = require("./types/shortstring.js");
const { longstring } = require("./types/longstring.js");
const { spacetimestamp } = require("./types/spacetimestamp.js");
const { biguint256 } = require("./types/biguint256.js");
const { float64 } = require("./types/float64.js");

const types = {
  ufoid,
  uuid,
  shortstring,
  longstring,
  spacetimestamp,
  biguint256,
  //float64, //TODO Fix to use lexicographical sorting.
};

module.exports = { types };
