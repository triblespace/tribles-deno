import { ByteBitset } from "../bitset.ts";

class IntersectionConstraint {
  constructor(constraints) {
    this.constraints = constraints;
  }

  variables() {
    let bitset = new ByteBitset();
    for (const constraint of this.constraints) {
      bitset.setUnion(bitset, constraint.variables());
    }
    return bitset;
  }

  estimate(variable, binding) {
    let min = Number.MAX_VALUE;
    for (const constraint of this.constraints) {
      min = Math.min(min, constraint.estimate(variable, binding));
    }
    return min;
  }

  propose(variable, binding) {
    const relevant_constraints = this.constraints.filter((c) => c.variables().has(variable));
    relevant_constraints.sort((a, b) => a.estimate(variable, binding) - b.estimate(variable, binding))

    const proposal = relevant_constraints[0].propose(variable, binding);
    for(let i = 1; i < relevant_constraints.length; i++) {
      relevant_constraints[i].confirm(variable, binding, proposal);
    }

    return proposal;
  }

  confirm(variable, binding, values) {
    for (const constraint of this.constraints) {
      constraint.confirm(variable, values, binding);
    }
  }
}

/**
 * Create a intersection constraint of the passed constraints.
 * @param {...Constraint} constraints - All the constraints that must hold true.
 * @returns {Constraint} A constraint that has a variable assignment that is only valid if it is a variable asignment of all the passed constraints.
 */
export function and(...constraints) {
  return new IntersectionConstraint(constraints);
}
