import { VALUE_SIZE } from "../trible.js";

const MIN_KEY = new Uint8Array(VALUE_SIZE).fill(0);
const MAX_KEY = new Uint8Array(VALUE_SIZE).fill(~0);

class RangeConstraint {
  constructor(variable, lowerBound, upperBound) {
    this.lowerBound = lowerBound;
    this.upperBound = upperBound;
    this.variable = variable;
    this.depth = 0;
    this.lowerFringe = 0;
    this.upperFringe = 0;
  }
  peekByte() {
    return null;
  }

  proposeByte(bitset) {
    const lowerByte = this.depth === this.lowerFringe
      ? this.lowerBound[this.depth]
      : 0;
    const upperByte = this.depth === this.upperFringe
      ? this.upperBound[this.depth]
      : 255;

    bitset.setRange(lowerByte, upperByte);
  }

  pushByte(byte) {
    if (
      this.depth === this.lowerFringe &&
      byte === this.lowerBound[this.depth]
    ) {
      this.lowerFringe++;
    }
    if (
      this.depth === this.upperFringe &&
      byte === this.upperBound[this.depth]
    ) {
      this.upperFringe++;
    }
    this.depth++;
  }

  popByte() {
    this.depth--;

    if (this.depth < this.lowerFringe) {
      this.lowerFringe = this.depth;
    }
    if (this.depth < this.upperFringe) {
      this.upperFringe = this.depth;
    }
  }

  variables(bitset) {
    bitset.unsetAll();
    bitset.set(this.variable);
  }

  blocked(bitset) {
    bitset.unsetAll();
  }

  pushVariable(_variable) {}

  popVariable() {}

  variableCosts(_variable) {
    return Number.MAX_VALUE;
  }
}

/**
 * TODO
 * @param {Variable} variable - TODO
 * @param {Type} type - TODO
 * @param {Object} bounds - TODO
 * @returns {Constraint} TODO
 */
export function ranged(
  variable,
  type,
  { lower, upper },
) {
  variable.typed(type);

  let encodedLower = MIN_KEY;
  let encodedUpper = MAX_KEY;

  if (lower !== undefined) {
    encodedLower = new Uint8Array(VALUE_SIZE);
    type.encoder(lower, encodedLower);
  }
  if (upper !== undefined) {
    encodedUpper = new Uint8Array(VALUE_SIZE);
    type.encoder(upper, encodedUpper);
  }
  return new RangeConstraint(variable.index, encodedLower, encodedUpper);
}
