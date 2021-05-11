const uuidLib = require("uuid");

function uuidEncoder(v, b) {
  if (!uuidLib.validate(v)) {
    throw Error(`Provided value ${v} is not an encodable uuid.`);
  }
  if (v === uuidLib.NIL) {
    throw Error("Can't encode NIL uuid.");
  }
  b.fill(0, 0, b.length - 16);
  b.set(uuidLib.parse(v), b.length - 16);
  return null;
}

function uuidDecoder(b, blob) {
  return uuidLib.stringify(b.subarray(b.length - 16));
}

const uuid = {
  encoder: uuidEncoder,
  decoder: uuidDecoder,
};

module.exports = { uuid };
