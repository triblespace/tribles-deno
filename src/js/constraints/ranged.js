import { lessValue, VALUE_SIZE } from "../trible.js";
import { filterInPlance } from "../util.js";

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

  estimate(variable, binding) {
    return Number.MAX_VALUE;
  }

  propose(variable, binding) {
    throw Error("Proposal too large.");
  }

  confirm(variable, binding, values) {
    filterInPlance(values, (value) => {
      !lessValue(value, this.lowerBound) &&
        !lessValue(this.upperBound, value);
    });
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
