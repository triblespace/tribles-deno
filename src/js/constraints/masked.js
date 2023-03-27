import { ByteBitset } from "../bitset.js";

// Can be used like a projection, but one must makes sure that the masked constraint
// implicitly existentially quantifies the variables masked.
class MaskedConstraint {
  constructor(constraint, maskedVariables) {
    this.constraint = constraint;
    this.mask = new ByteBitset();
    for (const v of maskedVariables) {
      this.mask.set(v);
    }
  }

  seek(value) {
    return this.constraint.seek(value);
  }

  variables(bitset) {
    this.constraint.variables(bitset);
    bitset.setSubtraction(bitset, this.mask);
  }

  blocked(bitset) {
    this.constraint.blocked(bitset);
  }

  pushVariable(variable) {
    this.constraint.pushVariable(variable);
  }

  popVariable() {
    this.constraint.popVariable();
  }

  variableCosts(variable) {
    return this.constraint.variableCosts(variable);
  }
}

/**
 * TODO
 * @param {Constraint} constraint - TODO
 * @param {Variable} variable - TODO
 * @returns {Constraint} TODO
 */
export function masked(constraint, maskedVariables) {
  return new MaskedConstraint(constraint, maskedVariables.map((v) => v.index));
}
