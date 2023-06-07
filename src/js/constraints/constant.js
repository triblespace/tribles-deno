import { VALUE_SIZE, equalValue } from "../trible.js";

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

  *expand(variable, binding) {
    yield binding.set(this.variable, this.constant);
  }

  shrink(variable, value, binding) {
    return !equalValue(value, this.constant);
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
