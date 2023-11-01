import { ByteBitset } from "../bitset.ts";
import { Binding, Variable } from "../query.ts";
import { Value } from "../trible.ts";
import { Constraint } from "./constraint.ts";

class IntersectionConstraint implements Constraint {
  constraints: Constraint[];

  constructor(constraints: Constraint[]) {
    this.constraints = constraints;
  }

  variables(): ByteBitset {
    const bitset = new ByteBitset();
    for (const constraint of this.constraints) {
      bitset.setUnion(bitset, constraint.variables());
    }
    return bitset;
  }

  estimate(variable_index: number, binding: Binding): number {
    let min = Number.MAX_VALUE;
    for (const constraint of this.constraints) {
      if (constraint.variables().has(variable_index)) {
        min = Math.min(min, constraint.estimate(variable_index, binding));
      }
    }
    return min;
  }

  propose(variable_index: number, binding: Binding): Value[] {
    const relevant_constraints = this.constraints.filter((c) =>
      c.variables().has(variable_index)
    );
    relevant_constraints.sort((a, b) =>
      a.estimate(variable_index, binding) - b.estimate(variable_index, binding)
    );

    const proposal = relevant_constraints[0].propose(variable_index, binding);
    for (let i = 1; i < relevant_constraints.length; i++) {
      relevant_constraints[i].confirm(variable_index, binding, proposal);
    }

    return proposal;
  }

  confirm(variable_index: number, binding: Binding, values: Value[]): void {
    const relevant_constraints = this.constraints.filter((c) =>
      c.variables().has(variable_index)
    );
    relevant_constraints.sort((a, b) =>
      a.estimate(variable_index, binding) - b.estimate(variable_index, binding)
    );

    for (const constraint of relevant_constraints) {
      constraint.confirm(variable_index, binding, values);
    }
  }
}

/**
 * Create a intersection constraint of the passed constraints.
 * @param constraints - All the constraints that must hold true.
 * @returns A constraint that has a variable assignment that is only valid if it is a variable asignment of all the passed constraints.
 */
export function and(...constraints: Constraint[]): Constraint {
  return new IntersectionConstraint(constraints);
}
