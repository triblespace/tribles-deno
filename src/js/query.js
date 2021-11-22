import {
  emptyValuePACT,
  nextKey,
  bitIterator,
  seekBit,
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

const MODE_PATH = 0;
const MODE_BRANCH = 1;
const MODE_BACKTRACK = 2;

function* resolveSegment(cursors, binding) {
  let mode = MODE_PATH;
  let bitset = null;
  let depth = 0;
  let byte = 0;
  const branchStack = [[bitset, byte, depth]];

  let c = 0;
  outer: while (true) {
    if (mode === MODE_PATH) {
      while (true) {
        if (depth === 32) {
          if (yield) {
            let branchDepth;
            [bitset, byte, branchDepth] = branchStack[0];
            for (; branchDepth < depth; depth--) {
              for (c of cursors) {
                c.pop();
              }
            }
            return;
          }
          mode = MODE_BACKTRACK;
          continue outer;
        }

        c = 0;
        byte = cursors[c].peek();
        if (byte === undefined) debugger;
        if (byte === null) {
          byte = 0;
          bitset = new Uint32Array(8);
          bitset.fill(0xffffffff);
          for (; c < cursors.length; c++) {
            cursors[c].propose(bitset);
          }
          mode = MODE_BRANCH;
          continue outer;
        }
        for (c = 1; c < cursors.length; c++) {
          const other_byte = cursors[c].peek();
          if (other_byte === null) {
            bitset = new Uint32Array(8);
            setBit(bitset, byte);
            for (; c < cursors.length; c++) {
              cursors[c].propose(bitset);
            }
            mode = MODE_BRANCH;
            continue outer;
          }
          if (byte !== other_byte) {
            mode = MODE_BACKTRACK;
            continue outer;
          }
        }

        binding[depth] = byte;
        for (const c of cursors) {
          c.push(byte);
        }
        depth++;
      }
    }

    if (mode === MODE_BRANCH) {
      byte = seekBit(byte, bitset);
      if (byte > 255) {
        mode = MODE_BACKTRACK;
        continue outer;
      }
      binding[depth] = byte;
      branchStack.push([bitset, byte + 1, depth]);
      for (c of cursors) {
        c.push(byte);
      }
      depth++;
      mode = MODE_PATH;
      continue outer;
    }

    if (mode === MODE_BACKTRACK) {
      let branchDepth;
      [bitset, byte, branchDepth] = branchStack.pop();
      for (; branchDepth < depth; depth--) {
        for (c of cursors) {
          c.pop();
        }
      }
      if (bitset === null) {
        break outer;
      } else {
        mode = MODE_BRANCH;
        continue outer;
      }
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

    const segments = resolveSegment(cursors, bindings[variable]);
    for (const _ of segments) {
      const r = yield* resolve(
        constraints,
        ordering,
        ascendingVariables,
        bindings
      );
      hasResult = hasResult || r;
      if (hasResult && shortcircuit) {
        segments.next(true);
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
