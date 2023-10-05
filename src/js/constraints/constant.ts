import { equalValue, VALUE_SIZE } from "../trible.ts";
import { filterInPlace } from "../util.ts";

class ConstantConstraint {
  constructor(variable, constant) {
    this.variable = variable;
    this.constant = constant;
  }

  variables() {
    let bitset = new ByteBitset();
    bitset.set(this.variable);
    return bitset;
  }

  estimate(variable, binding) {
    return 1;
  }

  propose(_variable, _binding) {
    return [this.constant];
  }

  confirm(_variable, _binding, values) {
    filterInPlace(values, (value) => equalValue(value, this.constant));
  }
}

/**
 * Create a constraint for the given variable to the provided constant value.
 * @param {Variable} variable - The constrained variable.
 * @param {Uint32Array} constant - The constant value.
 * @returns {Constraint} The constraint usable with other constraints or `find`.
 */
export function constant(variable, constant) {
  if (constant.length !== VALUE_SIZE) throw new Error("Bad constant length.");
  return new ConstantConstraint(variable.index, constant);
}
