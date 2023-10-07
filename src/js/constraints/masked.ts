import { ByteBitset } from "../bitset.ts";
import { Binding, Variable } from "../query.ts";
import { Value } from "../trible.ts";
import { Constraint } from "./constraint.ts";

// Can be used like a projection, but one must makes sure that the masked constraint
// implicitly existentially quantifies the variables masked.
class MaskedConstraint implements Constraint {
  constraint: Constraint;
  mask: ByteBitset;

  // deno-lint-ignore no-explicit-any
  constructor(constraint: Constraint, maskedVariables: Variable<any>[]) {
    this.constraint = constraint;
    this.mask = new ByteBitset();
    for (const v of maskedVariables) {
      this.mask.set(v.index);
    }
  }

  variables() {
    const bitset = new ByteBitset();
    this.constraint.variables();
    bitset.setSubtraction(bitset, this.mask);
    return bitset;
  }

  estimate(variable_index: number, binding: Binding) {
    return this.constraint.estimate(variable_index, binding);
  }

  propose(variable_index: number, binding: Binding): Value[] {
    return this.constraint.propose(variable_index, binding);
  }

  confirm(variable_index: number, binding: Binding, values: Value[]) {
    this.constraint.confirm(variable_index, binding, values);
  }
}

/**
 * TODO
 * @param constraint - TODO
 * @param variable - TODO
 */
export function masked(constraint: Constraint, maskedVariables: Variable<unknown>[]) {
  return new MaskedConstraint(constraint, maskedVariables);
}
