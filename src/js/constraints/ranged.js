import { VALUE_SIZE } from "../trible.js";

const MIN_KEY = new Uint8Array(VALUE_SIZE).fill(0);
const MAX_KEY = new Uint8Array(VALUE_SIZE).fill(~0);

class RangeConstraint {
  constructor(variable, lowerBound, upperBound) {
    this.lowerBound = lowerBound;
    this.upperBound = upperBound;
    this.variable = variable;
  }

  variables() {
    let bitset = new ByteBitset();
    bitset.set(this.variable);
    return bitset;
  }

  estimate(binding) {
    return Number.MAX_VALUE;
  }

  *expand(binding) {
    return this.constraint.expand(binding);
  }

  shrink(binding) {
    return this.constraint.shrink(binding);
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
