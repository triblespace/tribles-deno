import { emptyValuePACT } from "./pact.js";
import { ID_SIZE, VALUE_SIZE } from "./trible.js";
import {
  intersectBitRange,
  nextBit,
  prevBit,
  setAllBit,
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

export function indexConstraint(variable, index) {
  return new IndexConstraint(variable, index);
}

export function collectionConstraint(variable, collection) {
  const indexBatch = emptyValuePACT.batch();
  for (const c of collection) {
    indexBatch.put(c);
  }
  const index = indexBatch.complete();
  return new IndexConstraint(variable, index);
}

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

  pop(times = 1) {
    this.depth -= times;

    if (this.depth < this.lowerFringe) {
      this.lowerFringe = this.depth;
    }
    if (this.depth < this.upperFringe) {
      this.upperFringe = this.depth;
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

export function rangeConstraint(
  variable,
  lowerBound = MIN_KEY,
  upperBound = MAX_KEY
) {
  return new RangeConstraint(variable, lowerBound, upperBound);
}

class DistinctCursor {
  constructor() {
    this.value = new Uint8Array(32);
    this.matchingPrefix = 0;
    this.depth = 0;
  }

  peek() {
    return null;
  }

  propose(bitset, offset) {
    if(this.matchingPrefix === 63) {
      unsetBit(bitset, this.value[31], offset);
    }
  }

  pop(times = 1) {
    this.depth -= times;
    this.matchingPrefix = Math.min(this.depth, this.matchingPrefix);
  }

  push(byte) {
    if(this.depth < 32) {
      this.value[this.depth] = byte;
      this.matchingPrefix++;
    } else {
      if(this.depth === this.matchingPrefix && this.value[this.depth - 32] === byte) {
        this.matchingPrefix++;
      }
    }
    this.depth++;
  }
}

class DistinctConstraint {
  constructor(leftVariable, rightVariable) {
    this.leftVariable = leftVariable;
    this.rightVariable = rightVariable;
    this.leftDone = false;
    this.rightDone = false;
    this.cursor = new DistinctCursor();
  }
  toString() {
    return `DistinctConstraint`;
  }

  dependencies(dependsOnSets) {}

  bid(isUnblocked) {
    if (!this.leftDone && isUnblocked(this.leftVariable)) {
      return [this.leftVariable, Number.MAX_VALUE];
    }
    if (!this.rightDone && isUnblocked(this.rightVariable)) {
      return [this.rightVariable, Number.MAX_VALUE];
    }
    return [null, Number.MAX_VALUE];
  }

  push(variable) {
    if (variable === this.leftVariable) {
      this.leftDone = true;
      return [this.cursor];

    }
    if(variable === this.rightVariable) {
      this.rightDone = true;
      return [this.cursor];
    }
    return [];
  }

  pop(variable) {
    if (variable === this.leftVariable) {
      this.leftDone = false;
    }
    if (variable === this.rightVariable) {
      this.rightDone = false;
    }
  }
}

export function distinctConstraint(leftVariable, rightVariable) {
  return new DistinctConstraint(leftVariable, rightVariable);
}

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

  pop(times = 1) {
    this.depth -= times;
  }

  push(byte) {
    this.depth++;
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

export function constantConstraint(variable, constant) {
  let value;
  if (constant.length === ID_SIZE) {
    value = new Uint8Array(VALUE_SIZE);
    value.set(constant, 16);
  } else {
    value = constant;
  }
  return new ConstantConstraint(variable, value);
}

export class OrderByMinCostAndBlockage {
  constructor(variableCount, projected, isBlocking = []) {
    this.variablesLeft = variableCount;
    this.explored = emptySet();
    this.blockedBy = new Uint32Array(variableCount * 8);
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
    //console.log("push:", variable);
    this.variablesLeft--;
    setBit(this.explored, variable);
  }

  pop(variable) {
    //console.log("pop:", variable);
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

function* resolveSegmentAscending(
  cursors,
  variable,
  bindings,
  branchPoints,
  cache,
  cached
) {
  const branchOffset = variable * BITSET_VALUE_SIZE;
  const bindingOffset = variable * VALUE_SIZE;

  let mode = MODE_PATH;
  let depth = 0;
  let branchPositions = 0;
  let offset = 0;

  outer: while (true) {
    offset = branchOffset + depth * BRANCH_BITSET_SIZE;
    switch (mode) {
      case MODE_PATH:
        while (true) {
          if (depth === 32) {
            if (yield) {
              for (const c of cursors) {
                c.pop(depth);
              }
              return;
            }
            mode = MODE_BACKTRACK;
            continue outer;
          }
          offset = branchOffset + depth * BRANCH_BITSET_SIZE;

          let byte = null;
          let noProposals = true;

          for (const cursor of cursors) {
            const peeked = cursor.peek();
            if (peeked === null) {
              if (noProposals) {
                noProposals = false;
                if (cached) {
                  branchPoints.set(cache.subarray(offset, offset + 8), offset);
                } else {
                  setAllBit(branchPoints, offset);
                }
              }
              cursor.propose(branchPoints, offset);
            } else {
              byte ??= peeked;
              if (byte !== peeked) {
                mode = MODE_BACKTRACK;
                continue outer;
              }
            }
          }

          if (byte === null) {
            branchPositions = branchPositions | (1 << depth);
            mode = MODE_BRANCH;
            continue outer;
          }
          if (
            (noProposals && cached && !hasBit(cache, byte, offset)) ||
            (!noProposals && !hasBit(branchPoints, byte, offset))
          ) {
            mode = MODE_BACKTRACK;
            continue outer;
          }

          bindings[bindingOffset + depth] = byte;
          for (const c of cursors) {
            c.push(byte);
          }
          depth++;
        }

        break;

      case MODE_BRANCH:
        const byte = nextBit(0, branchPoints, offset);
        if (byte > 255) {
          branchPositions = branchPositions & ~(1 << depth);
          mode = MODE_BACKTRACK;
          continue outer;
        }
        bindings[bindingOffset + depth] = byte;
        for (const c of cursors) {
          c.push(byte);
        }
        unsetBit(branchPoints, byte, offset);
        depth++;
        mode = MODE_PATH;
        continue outer;

        break;

      case MODE_BACKTRACK:
        //console.count(`backtracking:${variable}`);

        const newDepth = 31 - Math.clz32(branchPositions);
        if (newDepth < 0) {
          for (const c of cursors) {
            c.pop(depth);
          }
          return;
        } else {
          const pops = depth - newDepth;
          for (const c of cursors) {
            c.pop(pops);
          }
          depth = newDepth;
        }

        mode = MODE_BRANCH;
        continue outer;

        break;
    }
  }
}

function* resolveSegmentDescending(
  cursors,
  variable,
  bindings,
  branchPoints,
  cache,
  cached
) {
  const branchOffset = variable * BITSET_VALUE_SIZE;
  const bindingOffset = variable * VALUE_SIZE;

  let mode = MODE_PATH;
  let depth = 0;
  let branchPositions = 0;
  let offset = 0;

  outer: while (true) {
    offset = branchOffset + depth * BRANCH_BITSET_SIZE;
    switch (mode) {
      case MODE_PATH:
        while (true) {
          if (depth === 32) {
            if (yield) {
              for (const c of cursors) {
                c.pop(depth);
              }
              return;
            }
            mode = MODE_BACKTRACK;
            continue outer;
          }
          offset = branchOffset + depth * BRANCH_BITSET_SIZE;

          let byte = null;
          let noProposals = true;

          for (const cursor of cursors) {
            const peeked = cursor.peek();
            if (peeked === null) {
              if (noProposals) {
                noProposals = false;
                if (cached) {
                  branchPoints.set(cache.subarray(offset, offset + 8), offset);
                } else {
                  setAllBit(branchPoints, offset);
                }
              }
              cursor.propose(branchPoints, offset);
            } else {
              byte ??= peeked;
              if (byte !== peeked) {
                mode = MODE_BACKTRACK;
                continue outer;
              }
            }
          }

          if (byte === null) {
            branchPositions = branchPositions | (1 << depth);
            mode = MODE_BRANCH;
            continue outer;
          }
          if (
            (noProposals && cached && !hasBit(cache, byte, offset)) ||
            (!noProposals && !hasBit(branchPoints, byte, offset))
          ) {
            mode = MODE_BACKTRACK;
            continue outer;
          }

          bindings[bindingOffset + depth] = byte;
          for (const c of cursors) {
            c.push(byte);
          }
          depth++;
        }

        break;

      case MODE_BRANCH:
        const byte = prevBit(255, branchPoints, offset);
        if (byte < 0) {
          branchPositions = branchPositions & ~(1 << depth);
          mode = MODE_BACKTRACK;
          continue outer;
        }
        bindings[bindingOffset + depth] = byte;
        for (const c of cursors) {
          c.push(byte);
        }
        unsetBit(branchPoints, byte, offset);
        depth++;
        mode = MODE_PATH;
        continue outer;

        break;

      case MODE_BACKTRACK:
        //console.count(`backtracking:${variable}`);

        const newDepth = 31 - Math.clz32(branchPositions);
        if (newDepth < 0) {
          for (const c of cursors) {
            c.pop(depth);
          }
          return;
        } else {
          const pops = depth - newDepth;
          for (const c of cursors) {
            c.pop(pops);
          }
          depth = newDepth;
        }

        mode = MODE_BRANCH;
        continue outer;

        break;
    }
  }
}

const BRANCH_BITSET_SIZE = 8;
// TODO: Simply make 256-elements the default Bitset size everywhere.
const BITSET_VALUE_SIZE = VALUE_SIZE * BRANCH_BITSET_SIZE;
export function branchState(varCount) {
  return new Uint32Array(varCount * BITSET_VALUE_SIZE);
}

export function variableBindings(varCount) {
  return new Uint8Array(varCount * VALUE_SIZE);
}

export function dependencyState(varCount, constraints) {
  const dependsOnSets = new Uint32Array(varCount * 8);
  for (const c of constraints) {
    c.dependencies(dependsOnSets);
  }
  return dependsOnSets;
}

export class Query {
  constructor(
    varCount,
    constraints,
    ordering,
    ascendingVariables,
    postProcessing = (r) => r
  ) {
    this.constraints = constraints;
    this.ordering = ordering;
    this.ascendingVariables = ascendingVariables;
    this.postProcessing = postProcessing;
    this.bindings = variableBindings(varCount);
    this.branchPoints = branchState(varCount);
    this.dependencies = dependencyState(varCount, constraints);
    this.cache = branchState(varCount);
    this.cachedVariables = emptySet();
  }
  *run(caching = true) {
    for (const r of this.__resolve(caching)) {
      yield this.postProcessing(r);
    }
    if (caching) {
      setAllBit(this.cachedVariables);
    }
  }

  *__resolve(caching) {
    //init
    let hasResult = false;
    const variable = this.ordering.next(this.constraints);
    if (variable === null) {
      yield this.bindings;
      hasResult = true;
    } else {
      const ascending = this.ascendingVariables.has(variable);

      this.ordering.push(variable);

      const cursors = [];
      for (const c of this.constraints) {
        cursors.push(...c.push(variable));
      }

      const shortcircuit = this.ordering.isShortcircuit(variable);
      const cached = hasBit(this.cachedVariables, variable);
      //if (cached) console.log("cached ", variable);
      let segments;
      if (ascending) {
        segments = resolveSegmentAscending(
          cursors,
          variable,
          this.bindings,
          this.branchPoints,
          this.cache,
          cached
        );
      } else {
        segments = resolveSegmentDescending(
          cursors,
          variable,
          this.bindings,
          this.branchPoints,
          this.cache,
          cached
        );
      }

      const bindingOffset = variable * VALUE_SIZE;
      const cacheOffset = variable * BITSET_VALUE_SIZE;

      for (const _ of segments) {
        //console.log("variable", variable);
        const r = yield* this.__resolve(caching);
        hasResult = hasResult || r;
        if (caching && !cached && r) {
          for (let d = 0; d < VALUE_SIZE; d++) {
            setBit(
              this.cache,
              this.bindings[bindingOffset + d],
              cacheOffset + d * BRANCH_BITSET_SIZE
            );
          }
        }
        if (hasResult && shortcircuit) {
          segments.next(true);
        }
      }
      this.constraints.forEach((c) => c.pop(variable));
      this.ordering.pop(variable);
    }
    return hasResult;
  }
}

export class Variable {
  constructor(provider, index, name = null) {
    this.provider = provider;
    this.index = index;
    this.name = name;
    this.ascending = true;
    this.transform = null;
    this.upperBound = undefined;
    this.lowerBound = undefined;
    this.isProjected = true;
    this.paths = [];
    this.decoder = null;
    this.encoder = null;
    this.blobcache = null;
  }

  typed({ encoder, decoder }) {
    this.encoder = encoder;
    this.decoder = decoder;
    return this;
  }

  map(transformFn) {
    this.transform = transformFn;
    return this;
  }

  groupBy(otherVariable) {
    let potentialCycles = new Set([otherVariable.index]);
    while (potentialCycles.size !== 0) {
      if (potentialCycles.has(this)) {
        throw Error("Couldn't group variable, ordering would by cyclic.");
      }
      //TODO add omit sanity check.
      potentialCycles = new Set(
        this.provider.isBlocking
          .filter(([a, b]) => potentialCycles.has(b))
          .map(([a, b]) => a)
      );
    }
    this.provider.isBlocking.push([otherVariable.index, this.index]);
    return this;
  }

  ranged({ lower, upper }) {
    this.lowerBound = lower;
    this.upperBound = upper;
    return this;
  }
  // TODO: rework to 'ordered(o)' method that takes one of
  // ascending, descending, concentric
  // where concentric is relative to another variable that must be
  // bound before this variable
  ascend() {
    this.ascending = true;
    return this;
  }

  descend() {
    this.ascending = false;
    return this;
  }

  omit() {
    this.isProjected = false;
    this.provider.projected.delete(this.index);
    return this;
  }

  toString() {
    if (this.name) {
      return `${this.name}@${this.index}`;
    }
    return `__anon__@${this.index}`;
  }
  proposeBlobCache(blobcache) {
    // Todo check latency cost of blobcache, e.g. inMemory vs. S3.
    this.blobcache ||= blobcache;
    return this;
  }
}

export class VariableProvider {
  constructor() {
    this.nextVariableIndex = 0;
    this.variables = [];
    this.unnamedVariables = [];
    this.namedVariables = new Map();
    this.constantVariables = emptyValuePACT;
    this.isBlocking = [];
    this.projected = new Set();
  }

  namedCache() {
    return new Proxy(
      {},
      {
        get: (_, name) => {
          let variable = this.namedVariables.get(name);
          if (variable) {
            return variable;
          }
          variable = new Variable(this, this.nextVariableIndex, name);
          this.namedVariables.set(name, variable);
          this.variables.push(variable);
          this.projected.add(this.nextVariableIndex);
          this.nextVariableIndex++;
          return variable;
        },
      }
    );
  }

  unnamed() {
    const variable = new Variable(this, this.nextVariableIndex);
    this.unnamedVariables.push(variable);
    this.variables.push(variable);
    this.projected.add(this.nextVariableIndex);
    this.nextVariableIndex++;
    return variable;
  }

  constant(c) {
    let variable = this.constantVariables.get(c);
    if (!variable) {
      variable = new Variable(this, this.nextVariableIndex);
      variable.constant = c;
      this.constantVariables = this.constantVariables.put(c, variable);
      this.variables.push(variable);
      this.projected.add(this.nextVariableIndex);
      this.nextVariableIndex++;
    }
    return variable;
  }

  constraints() {
    const constraints = [];

    for (const constantVariable of this.constantVariables.values()) {
      constraints.push(
        constantConstraint(constantVariable.index, constantVariable.constant)
      );
    }

    for (const { upperBound, lowerBound, encoder, index } of this.variables) {
      let encodedLower = undefined;
      let encodedUpper = undefined;

      if (lowerBound !== undefined) {
        encodedLower = new Uint8Array(VALUE_SIZE);
        encoder(lowerBound, encodedLower);
      }
      if (upperBound !== undefined) {
        encodedUpper = new Uint8Array(VALUE_SIZE);
        encoder(upperBound, encodedUpper);
      }

      if (encodedLower !== undefined || encodedUpper !== undefined) {
        constraints.push(rangeConstraint(index, encodedLower, encodedUpper));
      }
    }

    return constraints;
  }
}

export function find(cfn) {
  const vars = new VariableProvider();
  const constraints = [];
  for (const constraintBuilder of cfn(vars.namedCache())) {
    const constraintGroup = constraintBuilder(vars);
    constraints.push(...constraintGroup);
  }

  constraints.push(...vars.constraints());

  const namedVariables = [...vars.namedVariables.values()];

  //console.log(namedVariables.map((v) => [v.name, v.index]));
  //console.log(constraints.map((c) => c.toString()));
  const postProcessing = (r) => {
    const result = {};
    for (const {
      index,
      transform,
      decoder,
      name,
      isProjected,
      blobcache,
    } of namedVariables) {
      if (isProjected) {
        const encoded = r.slice(index * VALUE_SIZE, (index + 1) * VALUE_SIZE);
        Object.defineProperty(result, name, {
          configurable: true,
          enumerable: true,
          get: function () {
            delete this[name];
            const decoded = decoder(
              encoded,
              // Note that there is a potential attack vector here, if we ever want to do query level access control.
              // An attacker could change the encoder to manipulate the encoded array and request a different blob.
              // This would be solved by freezing the Array, but since it's typed and the spec designers unimaginative...
              async () => await blobcache.get(encoded.slice())
            );
            return (this[name] = transform ? transform(decoded) : decoded);
          },
        });
      }
    }
    return result;
  };

  return new Query(
    vars.variables.length,
    constraints,
    new OrderByMinCostAndBlockage(
      vars.variables.length,
      vars.projected,
      vars.isBlocking
    ),
    new Set(vars.variables.filter((v) => v.ascending).map((v) => v.index)),
    postProcessing
  );
}
