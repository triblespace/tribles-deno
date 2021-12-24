import { emptyValuePACT } from "./pact.js";
import { ID_SIZE, VALUE_SIZE } from "./trible.js";
import {
  bitIntersect,
  bitIterator,
  intersectBitRange,
  nextBit,
  prevBit,
  setAllBit,
  unsetAllBit,
  unsetBit,
  setBit,
  hasBit,
  singleBitIntersect,
  emptySet,
  isSubsetOf,
} from "./bitset.js";

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

  toString() {
    return `IndexConstraint{variable:${
      this.variable
    }, size:${this.cursor.pact.count()}}`;
  }

  dependencies(dependsOnSets) {}

  bid(isUnblocked) {
    if (!this.done && isUnblocked(this.variable)) {
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

class RangeCursor {
  constructor(lowerBound, upperBound) {
    this.lowerBound = lowerBound;
    this.upperBound = upperBound;
    this.depth = 0;
    this.lowerFringe = 0;
    this.upperFringe = 0;
  }

  peek() {
    return null;
  }

  propose(bitset, offset) {
    const lowerByte =
      this.depth === this.lowerFringe ? this.lowerBound[this.depth] : 0;
    const upperByte =
      this.depth === this.upperFringe ? this.upperBound[this.depth] : 255;
    intersectBitRange(bitset, lowerByte, upperByte, offset);
  }

  pop() {
    if (this.depth === this.lowerFringe) {
      this.lowerFringe--;
    }
    if (this.depth === this.upperFringe) {
      this.upperFringe--;
    }
    this.depth--;
  }

  push(byte) {
    if (
      this.depth === this.lowerFringe &&
      byte === this.lowerBound[this.depth]
    ) {
      this.lowerFringe++;
    }
    if (
      this.depth === this.upperFringe &&
      byte === this.upperBound[this.depth]
    ) {
      this.upperFringe++;
    }
    this.depth++;
    return true;
  }
}

class RangeConstraint {
  constructor(variable, lowerBound, upperBound) {
    this.lowerBound = lowerBound;
    this.upperBound = upperBound;
    this.variable = variable;
    this.done = false;
  }
  toString() {
    return `RangeConstraint{variable:${this.variable}}`;
  }

  dependencies(dependsOnSets) {}

  bid(isUnblocked) {
    if (!this.done && isUnblocked(this.variable)) {
      return [this.variable, Number.MAX_VALUE];
    }
    return [null, Number.MAX_VALUE];
  }

  push(variable) {
    if (variable === this.variable) {
      this.done = true;
      return [new RangeCursor(this.lowerBound, this.upperBound)];
    }
    return [];
  }

  pop(variable) {
    if (variable === this.variable) {
      this.done = false;
    }
  }
}

const MIN_KEY = new Uint8Array(32).fill(0);
const MAX_KEY = new Uint8Array(32).fill(~0);

const rangeConstraint = (
  variable,
  lowerBound = MIN_KEY,
  upperBound = MAX_KEY
) => new RangeConstraint(variable, lowerBound, upperBound);

class ConstantCursor {
  constructor(constant) {
    this.constant = constant;
    this.depth = 0;
  }

  peek() {
    return this.constant[this.depth];
  }

  propose(bitset, offset) {
    singleBitIntersect(bitset, this.constant[this.depth], offset);
  }

  pop() {
    this.depth--;
  }

  push(byte) {
    this.depth++;
    return true;
  }
}

class ConstantConstraint {
  constructor(variable, constant) {
    this.cursor = new ConstantCursor(constant);
    this.variable = variable;
    this.done = false;
  }
  toString() {
    return `ConstantConstraint{variable:${this.variable}}`;
  }

  dependencies(dependsOnSets) {}

  bid(isUnblocked) {
    if (!this.done && isUnblocked(this.variable)) {
      return [this.variable, 1];
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
    }
  }
}

const constantConstraint = (variable, constant) => {
  let value;
  if (constant.length === ID_SIZE) {
    value = new Uint8Array(VALUE_SIZE);
    value.set(constant, 16);
  } else {
    value = constant;
  }
  return new ConstantConstraint(variable, value);
};

class OrderByMinCostAndBlockage {
  constructor(variableCount, projected, isBlocking = []) {
    this.variablesLeft = variableCount;
    this.explored = emptySet();
    this.blockedBy = new Uint32Array(variableCount * 8);
    this.dependencies = new Uint32Array(variableCount * 8);
    this.shortcircuit = emptySet();
    this.unblocked = emptySet();

    for (let v = 0; v < variableCount; v++) {
      if (!projected.has(v)) {
        for (const p of projected) {
          setBit(this.blockedBy, p, v * 8);
        }
        setBit(this.shortcircuit, v);
      }
    }

    for (const [blocker, blocked] of isBlocking) {
      setBit(this.blockedBy, blocker, blocked * 8);
    }
  }

  next(constraints) {
    if (this.variablesLeft === 0) return null;
    let candidateVariable = null;
    let candidateCosts = Number.MAX_VALUE;
    for (const c of constraints) {
      const [variable, costs] = c.bid((v) =>
        isSubsetOf(this.blockedBy, this.explored, v * 8)
      );
      if (costs <= candidateCosts) {
        candidateVariable = variable;
        candidateCosts = costs;
      }
      if (candidateCosts <= 1) break;
    }
    //console.log("next:", candidateVariable, candidateCosts);
    return candidateVariable;
  }

  isShortcircuit(variable) {
    return hasBit(this.shortcircuit, variable);
  }

  push(variable) {
    this.variablesLeft--;
    setBit(this.explored, variable);
  }

  pop(variable) {
    this.variablesLeft++;
    unsetBit(this.explored, variable);
  }
}

function branchBitmap(branchBuffer, depth) {
  return branchBuffer.subarray(depth, depth + 8);
}

const MODE_PATH = 0;
const MODE_BRANCH = 1;
const MODE_BACKTRACK = 2;

function* resolveSegmentAscending(cursors, variable, bindings, branchPoints) {
  const branchOffset = variable * BITSET_VALUE_SIZE;
  const bindingOffset = variable * VALUE_SIZE;

  let mode = MODE_PATH;
  let depth = 0;
  let branchPositions = 0;

  let c = 0;
  outer: while (true) {
    switch (mode) {
      case MODE_PATH:
        while (true) {
          if (depth === 32) {
            if (yield) {
              for (; 0 < depth; depth--) {
                for (c of cursors) {
                  c.pop();
                }
              }
              return;
            }
            for (c of cursors) {
              c.pop();
            }
            depth--;
            mode = MODE_BACKTRACK;
            continue outer;
          }

          c = 0;
          const byte = cursors[c].peek();
          if (byte === null) {
            setAllBit(branchPoints, branchOffset + depth * BRANCH_BITSET_SIZE);
            for (; c < cursors.length; c++) {
              cursors[c].propose(
                branchPoints,
                branchOffset + depth * BRANCH_BITSET_SIZE
              );
            }
            branchPositions = branchPositions | (1 << depth);
            mode = MODE_BRANCH;
            continue outer;
          }
          for (c = 1; c < cursors.length; c++) {
            const other_byte = cursors[c].peek();
            if (other_byte === null) {
              unsetAllBit(
                branchPoints,
                branchOffset + depth * BRANCH_BITSET_SIZE
              );
              setBit(
                branchPoints,
                byte,
                branchOffset + depth * BRANCH_BITSET_SIZE
              );
              for (; c < cursors.length; c++) {
                cursors[c].propose(
                  branchPoints,
                  branchOffset + depth * BRANCH_BITSET_SIZE
                );
              }
              branchPositions = branchPositions | (1 << depth);
              mode = MODE_BRANCH;
              continue outer;
            }
            if (byte !== other_byte) {
              mode = MODE_BACKTRACK;
              continue outer;
            }
          }

          bindings[bindingOffset + depth] = byte;
          for (const c of cursors) {
            c.push(byte);
          }
          depth++;
        }

        break;

      case MODE_BRANCH:
        const byte = nextBit(
          0,
          branchPoints,
          branchOffset + depth * BRANCH_BITSET_SIZE
        );
        if (byte > 255) {
          branchPositions = branchPositions & ~(1 << depth);
          mode = MODE_BACKTRACK;
          continue outer;
        }
        bindings[bindingOffset + depth] = byte;
        for (c of cursors) {
          c.push(byte);
        }
        unsetBit(branchPoints, byte, branchOffset + depth * BRANCH_BITSET_SIZE);
        depth++;
        mode = MODE_PATH;
        continue outer;

        break;

      case MODE_BACKTRACK:
        for (; (branchPositions & (1 << depth)) === 0 && 0 < depth; depth--) {
          for (c of cursors) {
            c.pop();
          }
        }
        if ((branchPositions & (1 << depth)) === 0) return;
        mode = MODE_BRANCH;
        continue outer;

        break;
    }
  }
}

function* resolveSegmentDescending(cursors, variable, bindings, branchPoints) {
  const branchOffset = variable * BITSET_VALUE_SIZE;
  const bindingOffset = variable * VALUE_SIZE;

  let mode = MODE_PATH;
  let depth = 0;
  let branchPositions = 0;

  let c = 0;
  outer: while (true) {
    switch (mode) {
      case MODE_PATH:
        while (true) {
          if (depth === 32) {
            if (yield) {
              for (; 0 < depth; depth--) {
                for (c of cursors) {
                  c.pop();
                }
              }
              return;
            }
            for (c of cursors) {
              c.pop();
            }
            depth--;
            mode = MODE_BACKTRACK;
            continue outer;
          }

          c = 0;
          const byte = cursors[c].peek();
          if (byte === null) {
            setAllBit(branchPoints, branchOffset + depth * BRANCH_BITSET_SIZE);
            for (; c < cursors.length; c++) {
              cursors[c].propose(
                branchPoints,
                branchOffset + depth * BRANCH_BITSET_SIZE
              );
            }
            branchPositions = branchPositions | (1 << depth);
            mode = MODE_BRANCH;
            continue outer;
          }
          for (c = 1; c < cursors.length; c++) {
            const other_byte = cursors[c].peek();
            if (other_byte === null) {
              unsetAllBit(
                branchPoints,
                branchOffset + depth * BRANCH_BITSET_SIZE
              );
              setBit(
                branchPoints,
                byte,
                branchOffset + depth * BRANCH_BITSET_SIZE
              );
              for (; c < cursors.length; c++) {
                cursors[c].propose(
                  branchPoints,
                  branchOffset + depth * BRANCH_BITSET_SIZE
                );
              }
              branchPositions = branchPositions | (1 << depth);
              mode = MODE_BRANCH;
              continue outer;
            }
            if (byte !== other_byte) {
              mode = MODE_BACKTRACK;
              continue outer;
            }
          }

          bindings[bindingOffset + depth] = byte;
          for (const c of cursors) {
            c.push(byte);
          }
          depth++;
        }

        break;

      case MODE_BRANCH:
        const byte = prevBit(
          255,
          branchPoints,
          branchOffset + depth * BRANCH_BITSET_SIZE
        );
        if (byte < 0) {
          branchPositions = branchPositions & ~(1 << depth);
          mode = MODE_BACKTRACK;
          continue outer;
        }
        bindings[bindingOffset + depth] = byte;
        for (c of cursors) {
          c.push(byte);
        }
        unsetBit(branchPoints, byte, branchOffset + depth * BRANCH_BITSET_SIZE);
        depth++;
        mode = MODE_PATH;
        continue outer;

        break;

      case MODE_BACKTRACK:
        //console.log("backtrack", variable);

        for (; (branchPositions & (1 << depth)) === 0 && 0 < depth; depth--) {
          for (c of cursors) {
            c.pop();
          }
        }
        if ((branchPositions & (1 << depth)) === 0) return;
        mode = MODE_BRANCH;
        continue outer;

        break;
    }
  }
}

const BRANCH_BITSET_SIZE = 8;
// TODO: Simply make 256-elements the default Bitset size everywhere.
const BITSET_VALUE_SIZE = VALUE_SIZE * BRANCH_BITSET_SIZE;
function branchState(varCount) {
  return new Uint32Array(varCount * BITSET_VALUE_SIZE);
}

function variableBindings(varCount) {
  return new Uint8Array(varCount * VALUE_SIZE);
}

function dependencyState(varCount, constraints) {
  const dependsOnSets = new Uint32Array(varCount * 8);
  for (const c of constraints) {
    c.dependencies(dependsOnSets);
  }
  return dependsOnSets;
}

function* resolve(
  constraints,
  ordering,
  ascendingVariables,
  bindings,
  branchPoints,
  dependencies,
  bias
) {
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

    let segments;
    if (ascending) {
      segments = resolveSegmentAscending(
        cursors,
        variable,
        bindings,
        branchPoints
      );
    } else {
      segments = resolveSegmentDescending(
        cursors,
        variable,
        bindings,
        branchPoints
      );
    }
    for (const _ of segments) {
      //console.log("variable", variable);
      const r = yield* resolve(
        constraints,
        ordering,
        ascendingVariables,
        bindings,
        branchPoints,
        dependencies,
        bias
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
  rangeConstraint,
  OrderByMinCostAndBlockage,
  resolve,
  branchState,
  dependencyState,
  variableBindings,
};
