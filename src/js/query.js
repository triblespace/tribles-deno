import { emptyValuePACT } from "./pact.js";
import { ID_SIZE, VALUE_SIZE } from "./trible.js";
import { ByteBitset, ByteBitsetArray } from "./bitset.js";

export const UPPER_START = 0;
export const UPPER_END = 16;

export const LOWER_START = 16;
export const LOWER_END = 32;

export const UPPER = (value) => value.subarray(UPPER_START, UPPER_END);
export const LOWER = (value) => value.subarray(LOWER_START, LOWER_END);

// This constraint is used when there is a fixed number of possible values for a variable.
// As with a collection where items should exist in, or when enumerating attributes from a namespace
// during a walk.
class IndexConstraint {
  constructor(variable, index) {
    this.cursor = index.cursor();
    this.variable = variable;
  }

  peekByte() {
    return this.cursor.peek();
  }

  proposeByte(bitset) {
    this.cursor.propose(bitset);
  }

  pushByte(byte) {
    this.cursor.push(byte);
  }

  popByte() {
    this.cursor.pop();
  }

  variables(bitset) {
    bitset.unsetAll();
    bitset.set(this.variable);
  }

  blocked(bitset) {
    bitset.unsetAll();
  }

  pushVariable(_variable) {}

  popVariable() {}

  variableCosts(_variable) {
    return this.cursor.segmentCount();
  }
}

class RangeConstraint {
  constructor(variable, lowerBound, upperBound) {
    this.lowerBound = lowerBound;
    this.upperBound = upperBound;
    this.variable = variable;
    this.depth = 0;
    this.lowerFringe = 0;
    this.upperFringe = 0;
  }
  peekByte() {
    return null;
  }

  proposeByte(bitset) {
    const lowerByte = this.depth === this.lowerFringe
      ? this.lowerBound[this.depth]
      : 0;
    const upperByte = this.depth === this.upperFringe
      ? this.upperBound[this.depth]
      : 255;

    bitset.setRange(lowerByte, upperByte);
  }

  pushByte(byte) {
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

  popByte() {
    this.depth--;

    if (this.depth < this.lowerFringe) {
      this.lowerFringe = this.depth;
    }
    if (this.depth < this.upperFringe) {
      this.upperFringe = this.depth;
    }
  }

  variables(bitset) {
    bitset.unsetAll();
    bitset.set(this.variable);
  }

  blocked(bitset) {
    bitset.unsetAll();
  }

  pushVariable(_variable) {}

  popVariable() {}

  variableCosts(_variable) {
    return Number.MAX_VALUE;
  }
}

const MIN_KEY = new Uint8Array(VALUE_SIZE).fill(0);
const MAX_KEY = new Uint8Array(VALUE_SIZE).fill(~0);

class ConstantConstraint {
  constructor(variable, constant) {
    this.variable = variable;
    this.constant = constant;
    this.depth = 0;
  }

  peekByte() {
    return this.constant[this.depth];
  }

  proposeByte(bitset) {
    bitset.unsetAll();
    bitset.set(this.constant[this.depth]);
  }

  popByte() {
    this.depth--;
  }

  pushByte(_byte) {
    this.depth++;
  }

  variables(bitset) {
    bitset.unsetAll();
    bitset.set(this.variable);
  }

  blocked(bitset) {
    bitset.unsetAll();
  }

  pushVariable(_variable) {}

  popVariable() {}

  variableCosts(_variable) {
    return 1;
  }
}

// TODO return single intersection constraint from multi TribleSet Trible
// constraints -> allows us to have a wasm only fast subconstraint
export const IntersectionConstraint = class {
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
};

// Can be used like a projection, but one must makes sure that the masked constraint
// implicitly existentially quantifies the variables masked.
export const MaskedConstraint = class {
  constructor(constraint, maskedVariables) {
    this.constraint = constraint;
    this.mask = new ByteBitset();
    for (const v of maskedVariables) {
      this.mask.set(v);
    }
  }

  // Interface API >>>

  peekByte() {
    return this.constraint.peekByte();
  }

  proposeByte(bitset) {
    return this.constraint.proposeByte(bitset);
  }

  pushByte(byte) {
    return this.constraint.pushByte(byte);
  }

  popByte() {
    return this.constraint.popByte();
  }

  variables(bitset) {
    this.constraint.variables(bitset);
    bitset.setSubtraction(bitset, this.mask);
  }

  blocked(bitset) {
    this.constraint.blocked(bitset);
  }

  pushVariable(variable) {
    this.constraint.pushVariable(variable);
  }

  popVariable() {
    this.constraint.popVariable();
  }

  variableCosts(variable) {
    return this.constraint.variableCosts(variable);
  }
};

const MODE_PATH = 0;
const MODE_BRANCH = 1;
const MODE_BACKTRACK = 2;

function VariableIterator(constraint, key_state) {
  return {
    branch_points: (new ByteBitset()).unsetAll(),
    branch_state: new ByteBitsetArray(32),
    key_state: key_state,
    mode: MODE_PATH,
    depth: 0,
    constraint: constraint,

    [Symbol.iterator]() {
      return this;
    },

    next(cancel) {
      if (cancel) {
        while (0 < this.depth) {
          this.depth -= 1;
          this.constraint.popByte();
        }
        this.mode = MODE_PATH;
        return { done: true, value: undefined };
      }
      outer:
      while (true) {
        switch (this.mode) {
          case MODE_PATH:
            while (this.depth < this.key_state.length) {
              const byte = this.constraint.peekByte();
              if (byte !== null) {
                this.key_state[this.depth] = byte;
                this.constraint.pushByte(byte);
                this.depth += 1;
              } else {
                this.constraint.proposeByte(this.branch_state.get(this.depth));
                this.branch_points.set(this.depth);
                this.mode = MODE_BRANCH;
                continue outer;
              }
            }
            this.mode = MODE_BACKTRACK;
            return { done: false, value: this.key_state };
          case MODE_BRANCH:
            const byte = this.branch_state.get(this.depth).drainNext();
            if (byte !== null) {
              this.key_state[this.depth] = byte;
              this.constraint.pushByte(byte);
              this.depth += 1;
              this.mode = MODE_PATH;
              continue outer;
            } else {
              this.branch_points.unset(this.depth);
              this.mode = MODE_BACKTRACK;
              continue outer;
            }
          case MODE_BACKTRACK:
            const parent_depth = this.branch_points.prev(255);
            if (parent_depth !== null) {
              while (parent_depth < this.depth) {
                this.depth -= 1;
                this.constraint.popByte();
              }
              this.mode = MODE_BRANCH;
              continue outer;
            } else {
              while (0 < this.depth) {
                this.depth -= 1;
                this.constraint.popByte();
              }
              return { done: true, value: undefined };
            }
        }
      }
    },
  };
}

export class Bindings {
  constructor(length, buffer = new Uint8Array(length * 32)) {
    this.length = length;
    this.buffer = buffer;
  }

  get(offset) {
    return this.buffer.subarray(offset * 32, (offset + 1) * 32);
  }

  copy() {
    return new Bindings(this.length, this.buffer.slice());
  }
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
    constraint,
    vars,
    postprocessing = (r) => r,
  ) {
    this.constraint = constraint;
    this.vars = vars;
    this.postprocessing = postprocessing;

    this.unexploredVariables = new ByteBitset();
    constraint.variables(this.unexploredVariables);
    const variableCount = this.unexploredVariables.count();

    this.bindings = new Bindings(variableCount);
  }

  *[Symbol.iterator]() {
    for (const binding of this.__resolve()) {
      yield this.postprocessing(this.vars, binding);
    }
  }

  *__resolve() {
    if (this.unexploredVariables.isEmpty()) {
      yield this.bindings.copy();
    } else {
      let nextVariable;
      let nextVariableCosts = Number.MAX_VALUE;

      const variables = new ByteBitset();
      this.constraint.blocked(variables);
      variables.setSubtraction(this.unexploredVariables, variables);

      if (variables.isEmpty()) {
        throw new Error("Can't evaluate query: blocked dead end.");
      }

      for (const variable of variables.entries()) {
        const costs = this.constraint.variableCosts(variable);
        if (costs <= nextVariableCosts) {
          nextVariable = variable;
          nextVariableCosts = costs;
        }
        if (nextVariableCosts <= 1) break;
      }

      this.unexploredVariables.unset(nextVariable);
      this.constraint.pushVariable(nextVariable);
      const variableAssignments = VariableIterator(
        this.constraint,
        this.bindings.get(nextVariable),
      );
      for (const _ of variableAssignments) {
        yield* this.__resolve();
      }
      this.constraint.popVariable();
      this.unexploredVariables.set(nextVariable);
    }
  }
}

export class Variable {
  constructor(provider, index, name = null) {
    this.provider = provider;
    this.index = index;
    this.name = name;
    this.decoder = null;
    this.encoder = null;
    this.blobcache = null;
  }

  toString() {
    if (this.name) {
      return `${this.name}@${this.index}`;
    }
    return `__anon__@${this.index}`;
  }

  typed({ encoder, decoder }) {
    this.encoder = encoder;
    this.decoder = decoder;
    return this;
  }

  proposeBlobCache(blobcache) {
    // Todo check latency cost of blobcache, e.g. inMemory vs. S3.
    this.blobcache ||= blobcache;
    return this;
  }
}

class UnnamedSequence {
  constructor(provider) {
    this.provider = provider;
  }

  [Symbol.iterator]() {
    return this;
  }
  next() {
    const variable = new Variable(
      this.provider,
      this.provider.nextVariableIndex,
    );
    this.provider.unnamedVariables.push(variable);
    this.provider.variables.push(variable);
    this.provider.nextVariableIndex++;
    return { value: variable };
  }
}

export class VariableProvider {
  constructor() {
    this.nextVariableIndex = 0;
    this.variables = [];
    this.unnamedVariables = [];
    this.namedVariables = new Map();
    this.constantVariables = [];
    this.isBlocking = [];
    this.projected = new Set();
  }

  namedVars() {
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
      },
    );
  }

  unnamedVars() {
    return new UnnamedSequence(this);
  }
}

export function decodeWithBlobcache(vars, binding) {
  const result = {};
  for (
    const {
      index,
      decoder,
      name,
      blobcache,
    } of vars.namedVariables.values()
  ) {
    const encoded = binding.get(index);
    const decoded = decoder(
      encoded,
      // Note that there is a potential attack vector here, if we ever want to do query level access control.
      // An attacker could change the encoder to manipulate the encoded array and request a different blob.
      // This would be solved by freezing the Array, but since it's typed and the spec designers unimaginative...
      async () => await blobcache.get(encoded.slice()),
    );
    result[name] = decoded;
  }
  return result;
}

/**
 * Gets passed an object that can be destructured for variable names and
 * returns a constraint builder that can be used to enumerate query results
 * with a call to find.
 *
 * @callback queryFn
 * @param {Object} vars - The variables used in this query.
 * @return {Function} A query function to be passed to find.
 */

/**
 * Create an iterable query object from the provided constraint function.
 * @param {queryFn} queryfn - A function representing the query.
 * @param {postprocessingFn} postprocessing - A function that maps over the query results and coverts them to usable values.
 * @returns {Query} Enumerates possible variable assignments satisfying the input query.
 */
export function find(queryfn, postprocessing = decodeWithBlobcache) {
  const vars = new VariableProvider();
  const constraint = queryfn(vars.namedVars(), vars.unnamedVars());
  return new Query(constraint, vars, postprocessing);
}
