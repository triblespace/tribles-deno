const uuid = require("uuid");

function uuidEncoder(v, b) {
  if (!uuid.validate(v)) {
    throw Error("Provided value ${v} is not an encodable uuid.");
  }
  if (v === uuid.NIL) {
    throw Error("Can't encode NIL uuid.");
  }
  b.fill(0, 0, b.length - 16);
  b.set(uuid.parse(v), b.length - 16);
  return null;
}

function uuidDecoder(b, blob) {
  return uuid.stringify(b.subarray(b.length - 16));
}

const uuidType = ({
  encoder: uuidEncoder,
  decoder: uuidDecoder,
});

module.exports = { uuidType };
