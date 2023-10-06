import { ByteBitset } from "../bitset.ts";
import { Constraint } from "./constraint.ts";

// Can be used like a projection, but one must makes sure that the masked constraint
// implicitly existentially quantifies the variables masked.
class MaskedConstraint implements Constraint {
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

  propose(variable, binding) {
    return this.constraint.propose(variable, binding);
  }

  confirm(variable, binding, values) {
    this.constraint.confirm(variable, binding, values);
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
