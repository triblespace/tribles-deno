import { ByteBitset } from "../bitset.js";

// TODO return single intersection constraint from multi TribleSet Trible
// constraints -> allows us to have a wasm only fast subconstraint
class IntersectionConstraint {
  constructor(constraints) {
    this.constraints = constraints;
    this.activeConstraints = [];
    this.variableStack = [];
  }

  // Interface API >>>

  peekByte() {
    let byte = null;
    for (const constraint of this.activeConstraints) {
      const peeked = constraint.peekByte();
      if (peeked !== null) {
        if (byte === null) {
          byte = peeked;
        }
        if (byte !== peeked) return null;
      } else {
        return null;
      }
    }

    return byte;
  }

  proposeByte(bitset) {
    bitset.setAll();
    let b = (new ByteBitset()).unsetAll();
    for (const constraint of this.activeConstraints) {
      constraint.proposeByte(b);
      bitset.setIntersection(bitset, b);
    }
  }

  pushByte(byte) {
    for (const constraint of this.activeConstraints) {
      constraint.pushByte(byte);
    }
  }

  popByte() {
    for (const constraint of this.activeConstraints) {
      constraint.popByte();
    }
  }

  variables(bitset) {
    bitset.unsetAll();
    let b = (new ByteBitset()).unsetAll();
    for (const constraint of this.constraints) {
      constraint.variables(b);
      bitset.setUnion(bitset, b);
    }
  }

  blocked(bitset) {
    bitset.unsetAll();
    let b = (new ByteBitset()).unsetAll();
    for (const constraint of this.constraints) {
      constraint.blocked(b);
      bitset.setUnion(bitset, b);
    }
  }

  pushVariable(variable) {
    this.variableStack.push(variable);
    this.activeConstraints.length = 0;
    let b = (new ByteBitset()).unsetAll();
    for (const constraint of this.constraints) {
      constraint.variables(b);
      if (b.has(variable)) {
        constraint.pushVariable(variable);
        this.activeConstraints.push(constraint);
      }
    }
  }

  popVariable() {
    this.variableStack.pop();
    for (const constraint of this.activeConstraints) {
      constraint.popVariable();
    }
    this.activeConstraints.length = 0;
    if (0 < this.variableStack.length) {
      const currentVariable = this.variableStack[this.variableStack.length - 1];
      let b = new ByteBitset();
      for (const constraint of this.constraints) {
        constraint.variables(b);
        if (b.has(currentVariable)) {
          this.activeConstraints.push(constraint);
        }
      }
    }
  }

  variableCosts(variable) {
    let min = Number.MAX_VALUE;
    let b = (new ByteBitset()).unsetAll();
    for (const constraint of this.constraints) {
      constraint.variables(b);
      if (b.has(variable)) {
        min = Math.min(min, constraint.variableCosts(variable));
      }
    }

    return min;
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
