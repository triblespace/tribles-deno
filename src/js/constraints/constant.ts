import { ByteBitset } from "../bitset.ts";
import { Binding, Variable } from "../query.ts";
import { equalValue, Value, VALUE_SIZE } from "../trible.ts";
import { filterInPlace } from "../util.ts";
import { Constraint } from "./constraint.ts";

export class ConstantConstraint implements Constraint {
  variable_index: number;
  constant: Value;

  constructor(variable_index: number, constant: Value) {
    this.variable_index = variable_index;
    this.constant = constant;
  }

  variables() {
    const bitset = new ByteBitset();
    bitset.set(this.variable_index);
    return bitset;
  }

  estimate(_variable_index: number, _binding: Binding) {
    return 1;
  }

  propose(_variable_index: number, _binding: Binding): Value[] {
    return [this.constant];
  }

  confirm(_variable_index: number, _binding: Binding, values: Value[]) {
    filterInPlace(values, (value) => equalValue(value, this.constant));
  }
}
