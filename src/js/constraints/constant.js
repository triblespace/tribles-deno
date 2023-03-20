import { VALUE_SIZE } from "../trible.js";

class ConstantConstraint {
  constructor(variable, constant) {
    this.variable = variable;
    this.constant = constant;
    this.depth = 0;
  }

  peekByte() {
    return this.constant[this.depth];
  }

  proposeByte(bitset) {
    bitset.unsetAll();
    bitset.set(this.constant[this.depth]);
  }

  popByte() {
    this.depth--;
  }

  pushByte(_byte) {
    this.depth++;
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
