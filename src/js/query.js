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
    //if (window.debug) console.log(candidateCosts);
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

const MODE_FASTPATH = 0;
const MODE_BRANCH = 1;
const MODE_DONE = 2;

function* resolveSegment(shortcircuit, cursors, binding, depth) {
  let hasResult = false;
  let failed = false;
  let d = depth;
  let c = 0;
  fastpath: while (true) {
    if (d === 32) {
      yield;
      hasResult = true;
      break;
    }

    c = 0;
    let byte = cursors[c].peek();
    if (byte === null) break fastpath;
    for (c = 1; c < cursors.length; c++) {
      const other_byte = cursors[c].peek();
      if (other_byte === null) break fastpath;
      if (byte !== other_byte) {
        failed = true;
        break fastpath;
      }
    }

    binding[d] = byte;
    for (c of cursors) {
      c.push(byte);
    }
    d++;
  }

  if (d < 32 && !failed) {
    const bitset = new Uint32Array(8);
    if (0 < c) {
      setBit(bitset, byte);
    } else {
      bitset.fill(0xffffffff);
    }
    for (; c < cursors.length; c++) {
      cursors[c].popose(bitset);
    }
    for (const bit of bitIterator(bitset)) {
      for (c of cursors) {
        c.push(bit);
      }
      binding[d] = bit;
      hasResult = yield* resolveSegment(shortcircuit, cursors, binding, d + 1);
      for (c of cursors) {
        c.pop();
      }
      if (shortcircuit && hasResult) break;
    }
  }

  for (; depth < d; d--) {
    for (c of cursors) {
      c.pop();
    }
  }

  return hasResult;
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

    for (const s of resolveSegment(
      ordering.shortcircuit(),
      cursors,
      bindings[variable],
      0
    )) {
      yield* resolve(constraints, ordering, ascendingVariables, bindings);
    }
    for (c of cursors) {
      c.pop();
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
