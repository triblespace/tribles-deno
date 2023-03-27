import { cmpValue, VALUE_SIZE } from "../trible.js";

class ConstantConstraint {
  constructor(variable, constant) {
    this.variable = variable;
    this.constant = constant;
  }

  seek(value) {
    if (cmpValue(value, this.constant) <= 0) {
      return this.constant;
    } else {
      return null;
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
    return 1;
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
