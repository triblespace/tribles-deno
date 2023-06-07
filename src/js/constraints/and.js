import { ByteBitset } from "../bitset.js";

// TODO return single intersection constraint from multi TribleSet Trible
// constraints -> allows us to have a wasm only fast subconstraint
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

  estimate(binding) {
    let min = Number.MAX_VALUE;
    for (const constraint of this.constraints) {
      min = Math.min(min, constraint.estimate(binding));
    }

    return min;
  }

  *expand(binding) {
    let min = Number.MAX_VALUE;
    let expander = null;
    let shrinkers = [];
    for (const candidate of this.constraints) {
      if(expander === null) {
        expander = candidate;
        continue;
      }
      const candiate_estimate = candidate.estimate(binding);
      if(min < candiate_estimate) {
        shrinkers.push(expander);
        min = candiate_estimate;
        expander = candidate;
      } else {
        shrinkers.push(candidate);
      }
    }

    propose: for(const proposal of expander.expand(binding)) {
      for (const shrinker of shrinkers) {
        if(shrinker.shrink(proposal)) {
          continue propose;
        }
      }
      yield proposal;
    }
  }

  shrink(binding) {
    for (const constraint of this.constraints) {
      if(constraint.shrink(binding)) {
        return true;
      }
    }
    return false;
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
