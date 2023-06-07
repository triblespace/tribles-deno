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

  variables() {
    let bitset = new ByteBitset();
    this.constraint.variables();
    bitset.setSubtraction(bitset, this.mask);
    return bitset;
  }

  estimate(variable, binding) {
    return this.constraint.estimate(variable, binding);
  }

  *expand(variable, binding) {
    return this.constraint.expand(variable, binding);
  }

  shrink(variable, value, binding) {
    return this.constraint.shrink(variable, binding);
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
