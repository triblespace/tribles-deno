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

const inmemoryCosts = 1;

// This constraint is used when there is a fixed number of possible values for a variable.
// As with a collection where items should exist in, or when enumerating attributes from a namespace
// during a walk.
class IndexConstraint {
  constructor(variable, index) {
    this.cursor = index.cursor();
    this.variable = variable;
    this.done = false;
  }

  bid(unblocked) {
    if (!this.done && unblocked.has(this.variable)) {
      const costs = this.cursor.segmentCount() * inmemoryCosts;
      return [this.variable, costs];
    }
    return [null, Number.MAX_VALUE];
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
  constructor(variableCount, projected, isBlocking = []) {
    this.isBlocking = new Map();
    this.shortcircuit = new Set();
    this.semaphores = new Uint8Array(variableCount);
    this.unblocked = new Set();

    for (let v = 0; v < variableCount; v++) {
      if (!projected.has(v)) {
        for (const p of projected) {
          const bs = this.isBlocking.get(p) || new Set();
          bs.add(v);
          this.isBlocking.set(p, bs);
        }
        this.shortcircuit.add(v);
      }
    }

    for (const [blocker, blocked] of isBlocking) {
      const bs = this.isBlocking.get(blocker) || new Set();
      bs.add(blocked);
      this.isBlocking.set(blocker, bs);
    }

    for (const [blocker, bs] of this.isBlocking.entries()) {
      for (const b of bs) {
        this.semaphores[b]++;
      }
    }

    for (let v = 0; v < variableCount; v++) {
      if (this.semaphores[v] === 0) {
        this.unblocked.add(v);
      }
    }
  }

  next(constraints) {
    let candidateVariable = null;
    let candidateCosts = Number.MAX_VALUE;
    for (const c of constraints) {
      const [variable, costs] = c.bid(this.unblocked);
      if (costs <= candidateCosts) {
        candidateVariable = variable;
        candidateCosts = costs;
      }
      if (candidateCosts <= 1) break;
    }
    //if (window.debug) console.log(candidateCosts);
    return candidateVariable;
  }

  isShortcircuit(variable) {
    return this.shortcircuit.has(variable);
  }

  push(variable) {
    const blocked = this.isBlocking.get(variable);
    if (blocked !== undefined) {
      for (const v of blocked) {
        if (--this.semaphores[v] === 0) {
          this.unblocked.add(v);
        }
      }
    }
  }

  pop(variable) {
    const blocked = this.isBlocking.get(variable);
    if (blocked !== undefined) {
      for (const v of blocked) {
        if (this.semaphores[v]++ === 0) {
          this.unblocked.delete(v);
        }
      }
    }
  }
}

function* resolveSegment(cursors, binding, depth = 0) {
  let failed = false;
  let byte;
  let d = depth;
  let c = 0;
  fastpath: while (true) {
    if (d === 32) {
      yield;
      break;
    }

    c = 0;
    byte = cursors[c].peek();
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
      cursors[c].propose(bitset);
    }
    for (const bit of bitIterator(bitset)) {
      for (c of cursors) {
        c.push(bit);
      }
      binding[d] = bit;
      yield* resolveSegment(cursors, binding, d + 1);
      for (c of cursors) {
        c.pop();
      }
    }
  }

  for (; depth < d; d--) {
    for (c of cursors) {
      c.pop();
    }
  }
}

function* resolve(constraints, ordering, ascendingVariables, bindings) {
  //init
  let hasResult = false;
  const variable = ordering.next(constraints);
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

    const shortcircuit = ordering.isShortcircuit(variable);

    for (const _iter of resolveSegment(cursors, bindings[variable])) {
      const r = yield* resolve(
        constraints,
        ordering,
        ascendingVariables,
        bindings
      );
      hasResult = hasResult || r;
      if (hasResult && shortcircuit) break;
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
