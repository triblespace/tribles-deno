import {
  emptyValuePACT,
  nextKey,
  bitIterator,
  singleBitIntersect,
  bitIntersect,
  setBit,
  unsetAllBit,
  setAllBit,
} from "./pact.js";
import { ID_SIZE, VALUE_SIZE } from "./trible.js";

// This constraint is used when there is a fixed number of possible values for a variable.
// As with a collection where items should exist in, or when enumerating attributes from a namespace
// during a walk.
class IndexConstraint {
  constructor(variable, index) {
    this.cursor = index.segmentCursor();
    this.variable = variable;
    this.done = false;
  }

  propose() {
    if (this.done) return [];
    return [
      {
        variable: this.variable,
        costs: [this.cursor.segmentCount()],
      },
    ];
  }

  push(variable) {
    if (variable === this.variable) {
      this.done = true;
      return [this.cursor];
    }
    return [];
  }

  pop(variable) {
    if (variable === this.variable) {
      this.done = false;
      return this.cursor;
    }
  }
}

const indexConstraint = (variable, index) => {
  return new IndexConstraint(variable, index);
};

const collectionConstraint = (variable, collection) => {
  const indexBatch = emptyValuePACT.batch();
  for (const c of collection) {
    indexBatch.put(c);
  }
  const index = indexBatch.complete();
  return new IndexConstraint(variable, index);
};

class LowerBoundCursor {
  constructor(ascending, lowerBound) {
    this.ascending = ascending;
    this.lowerBound = lowerBound;
    this.valid = true;
    this.current = new Uint8Array(VALUE_SIZE);
    if (ascending) {
      this.current.set(lowerBound);
    } else {
      this.current.fill(255);
    }
  }
  isValid() {
    return this.valid;
  }
  peek(buffer) {
    if (!this.valid) return false;
    buffer.set(this.current);
    return true;
  }
  seek(soughtInfix) {
    if (this.valid) {
      for (let i = 0; i < VALUE_SIZE; i++) {
        if (this.lowerBound[i] > soughtInfix[i]) {
          if (!this.ascending) {
            this.valid = false;
          }
          //No need to reset the current to the lower bound because it's already set.
          return false;
        } else if (this.lowerBound[i] < soughtInfix[i]) {
          this.current.set(soughtInfix);
          return true;
        }
      }
      this.current.set(soughtInfix);
      return true;
    }
  }
}

// Constraint that returns only values equal to or larger than a lower bound.
class LowerBoundConstraint {
  constructor(variable, lowerBound) {
    this.lowerBound = lowerBound;
    this.variable = variable;
    this.done = false;
  }

  propose() {
    if (this.done) return [];
    return [
      {
        variable: this.variable,
        costs: [Number.MAX_VALUE],
      },
    ];
  }

  push(variable, ascending) {
    if (variable === this.variable) {
      this.done = true;
      return [new LowerBoundCursor(ascending, this.lowerBound)];
    }
    return [];
  }

  pop(variable) {
    if (variable === this.variable) {
      this.done = false;
    }
  }
}

const lowerBoundConstraint = (variable, lowerBound) =>
  new LowerBoundConstraint(variable, lowerBound);

class UpperBoundCursor {
  constructor(ascending, upperBound) {
    this.ascending = ascending;
    this.upperBound = upperBound;
    this.valid = true;
    this.current = new Uint8Array(VALUE_SIZE);
    if (ascending) {
      this.current.fill(0);
    } else {
      this.current.set(upperBound);
    }
  }
  isValid() {
    return this.valid;
  }
  peek(buffer) {
    if (!this.valid) return false;
    buffer.set(this.current);
    return true;
  }
  seek(soughtInfix) {
    if (this.valid) {
      for (let i = 0; i < VALUE_SIZE; i++) {
        if (this.upperBound[i] < soughtInfix[i]) {
          if (this.ascending) {
            this.valid = false;
          }
          //No need to reset the current to the upper bound because it's already set.
          return false;
        } else if (this.upperBound[i] > soughtInfix[i]) {
          this.current.set(soughtInfix);
          return true;
        }
      }
      this.current.set(soughtInfix);
      return true;
    }
  }
}

// Constraint that returns only values equal to or smaller than an upper bound.
class UpperBoundConstraint {
  constructor(variable, upperBound) {
    this.upperBound = upperBound;
    this.variable = variable;
    this.done = false;
  }

  propose() {
    if (this.done) return [];
    return [
      {
        variable: this.variable,
        costs: [Number.MAX_VALUE],
      },
    ];
  }

  push(variable, ascending) {
    if (variable === this.variable) {
      this.done = true;
      return [new UpperBoundCursor(ascending, this.upperBound)];
    }
    return [];
  }

  pop(variable) {
    if (variable === this.variable) {
      this.done = false;
    }
  }
}

const upperBoundConstraint = (variable, upperBound) =>
  new UpperBoundConstraint(variable, upperBound);

const constantConstraint = (variable, constant) => {
  let value;
  if (constant.length === ID_SIZE) {
    value = new Uint8Array(VALUE_SIZE);
    value.set(constant, 16);
  } else {
    value = constant;
  }
  return new IndexConstraint(variable, emptyValuePACT.put(value));
};

class OrderByMinCostAndBlockage {
  constructor(projected, blockedBy = []) {
    this.blockedBy = blockedBy;
    this.projected = projected;
    this.projectCount = projected.size;
    this.omitCount = 0;
    this.exploredVariables = new Set();
    this.isProjection = false;
  }

  propose(constraints) {
    let candidateVariable = null;
    let candidateCosts = Number.MAX_VALUE;
    for (const c of constraints) {
      for (const proposal of c.propose()) {
        const minCosts = Math.min(...proposal.costs);
        const variable = proposal.variable;
        if (
          minCosts <= candidateCosts &&
          (this.projectCount === 0 || this.projected.has(variable)) &&
          this.blockedBy.every(
            ([blocked, blocker]) =>
              variable !== blocked || this.exploredVariables.has(blocker)
          )
        ) {
          candidateVariable = variable;
          candidateCosts = minCosts;
        }
      }
    }
    //console.log(this.exploredVariables, candidateVariable, candidateCosts);
    return candidateVariable;
  }

  shortcircuit() {
    return !this.isProjection;
  }

  push(variable) {
    this.exploredVariables.add(variable);
    if ((this.isProjection = this.projected.has(variable))) {
      this.projectCount--;
    } else {
      this.omitCount++;
    }
  }

  pop(variable) {
    this.exploredVariables.delete(variable);
    if (this.projected.has(variable)) {
      this.projectCount++;
    } else {
      this.omitCount--;
    }
    this.isProjection = this.omitCount === 0;
  }
}

function* resolve(constraints, ordering, ascendingVariables, bindings) {
  //init
  let hasResult = false;
  const variable = ordering.propose(constraints);
  if (variable === null) {
    yield bindings;
    hasResult = true;
  } else {
    const ascending = ascendingVariables.has(variable);

    ordering.push(variable);

    const cursors = [];
    for (const c of constraints) {
      cursors.push(...c.push(variable));
    }

    const pathBytes = bindings[variable].fill(0);
    const pathBitsets = Array.from({ length: 32 }, () =>
      new Uint32Array(8).fill(0xffffffff)
    );
    const pathBitIterators = new Array(32);
    for (let c of cursors) {
      c.bitIntersect(pathBitsets[0]);
    }

    let depth = 0;
    pathBitIterators[depth] = bitIterator(pathBitsets[depth]);

    while (true) {
      const i = pathBitIterators[depth].next();
      if (i.done) {
        if (depth === 0) break;
        depth--;
        for (const c of cursors) {
          c.pop();
        }
      } else {
        pathBytes[depth] = i.value;
        for (let c of cursors) {
          c.push(i.value);
        }
        if (depth === 31) {
          const newHasResult = yield* resolve(
            constraints,
            ordering,
            ascendingVariables,
            bindings
          );
          hasResult ||= newHasResult;
          if (hasResult && ordering.shortcircuit()) {
            for (c of cursors) {
              for (let d = 0; d < 32; d++) {
                c.pop();
              }
            }
            break;
          } else {
            for (let c of cursors) {
              c.pop();
            }
          }
        } else {
          depth++;
          setAllBit(pathBitsets[depth]);
          for (let c of cursors) {
            c.bitIntersect(pathBitsets[depth]);
          }
          pathBitIterators[depth] = bitIterator(pathBitsets[depth]);
        }
      }
    }

    constraints.forEach((c) => c.pop(variable));
    ordering.pop(variable);
  }
  return hasResult;
}

export {
  collectionConstraint,
  constantConstraint,
  indexConstraint,
  lowerBoundConstraint,
  OrderByMinCostAndBlockage,
  resolve,
  upperBoundConstraint,
};
