import { ByteBitset } from "../bitset.ts";
import { emptyValuePATCH } from "../patch.ts";
import { Binding, Variable } from "../query.ts";
import { Value } from "../trible.ts";
import { filterInPlace } from "../util.ts";
import { Constraint } from "./constraint.ts";

// This constraint is used when there is a fixed number of possible values for a variable.
// As with a collection where items should exist in, or when enumerating attributes from a namespace
// during a walk.
class IndexConstraint implements Constraint {
  variable_index: number;
  index: typeof emptyValuePATCH;

  constructor(variable_index: number, index: typeof emptyValuePATCH) {
    this.variable_index = variable_index;
    this.index = index;
  }

  variables(): ByteBitset {
    const bitset = new ByteBitset();
    bitset.set(this.variable_index);
    return bitset;
  }

  estimate(_variable_index: number, _binding: Binding): number {
    return this.index.count();
  }

  propose(_variable_index: number, _binding: Binding): Value[] {
    return [...this.index.infixes((key) => key)];
  }

  confirm(_variable_index: number, _binding: Binding, values: Value[]): void {
    filterInPlace(values, (value) => this.index.has(value));
  }
}

/**
 * Create a constraint for the given variable to the values of the provided index.
 * @param variable - The constrained variable.
 * @param index - The constant values.
 * @returns The constraint usable with other constraints or `find`.
 */
export function indexed<T>(variable: Variable<T>, index: typeof emptyValuePATCH): Constraint {
  return new IndexConstraint(variable.index, index);
}
