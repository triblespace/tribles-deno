import { emptyValuePACT } from "./pact.js";
import { ID_SIZE, VALUE_SIZE } from "./trible.js";
import {
  ByteBitset,
  ByteBitsetArray
} from "./bitset.js";

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
    this.cursor.pop()
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

  countVariable(_variable) {
    return this.cursor.segmentCount();
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
    const lowerByte =
      this.depth === this.lowerFringe ? this.lowerBound[this.depth] : 0;
    const upperByte =
      this.depth === this.upperFringe ? this.upperBound[this.depth] : 255;
    
    bitset.setRange(lowerByte, upperByte);
  }

  pushByte(byte) {
    if(
      this.depth === this.lowerFringe &&
      byte === this.lowerBound[this.depth]
    ) {
      this.lowerFringe++;
    }
    if(
      this.depth === this.upperFringe &&
      byte === this.upperBound[this.depth]
    ) {
      this.upperFringe++;
    }
    this.depth++;
  }

  popByte() {
    this.depth--;

    if(this.depth < this.lowerFringe) {
      this.lowerFringe = this.depth;
    }
    if(this.depth < this.upperFringe) {
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

  countVariable(_variable) {
    return Number.MAX_VALUE;
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

  countVariable(_variable) {
    return 1;
  }
}

export function constantConstraint(variable, constant) {
  if(constant.length !== VALUE_SIZE) throw new Error("Bad constant length.");
  return new ConstantConstraint(variable, constant);
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
      if(peeked !== null) {
          if(byte === null) {
            byte = peeked;
          }
          if(byte !== peeked) return null;
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
    for(const constraint of this.constraints) {
      constraint.variables(b);
      bitset.setUnion(bitset, b);
    }
  }

  blocked(bitset) {
    bitset.unsetAll();
    let b = (new ByteBitset()).unsetAll();
    for(const constraint of this.constraints) {
      constraint.blocked(b);
      bitset.setUnion(bitset, b);
    }
  }

  pushVariable(variable) {
    this.variableStack.push(variable);
    this.activeConstraints.length = 0;
    let b = (new ByteBitset()).unsetAll();
    for(const constraint of this.constraints) {
      constraint.variables(b);
      if(b.has(variable)) {
        constraint.pushVariable(variable);
        this.activeConstraints.push(constraint);
      }
    }
  }

  popVariable() {
    this.variableStack.pop();
    for(const constraint of this.activeConstraints) {
      constraint.popVariable();
    }
    this.activeConstraints.length = 0;
    if(0 < this.variableStack.length) {
      const currentVariable = this.variableStack[this.variableStack.length-1];
      let b = new ByteBitset();
      for(const constraint of this.constraints) {
        constraint.variables(b);
        if(b.has(currentVariable)) {
          this.activeConstraints.push(constraint);
        }
      }
    }
  }

  countVariable(variable) {
    let min = Number.MAX_VALUE
    let b = (new ByteBitset()).unsetAll();
    for(const constraint of this.constraints) {
      constraint.variables(b);
      if(b.has(variable)) {
        min = Math.min(min, constraint.countVariable(variable));
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
    for(const v of maskedVariables) {
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

  countVariable(variable) {
    return this.constraint.countVariable(variable);
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
      if(cancel) {
        while (0 < this.depth){
          this.depth -= 1;
          this.constraint.popByte();
        }
        this.mode = MODE_PATH;
        return {done: true, value: undefined};
      }
      outer: while (true) {
        switch (this.mode) {
          case MODE_PATH:
            while (this.depth < this.key_state.length) {
              const byte = this.constraint.peekByte()
              if(byte !== null) {
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
            return {done:false, value: this.key_state};
          case MODE_BRANCH:
            const byte = this.branch_state.get(this.depth).drainNext()
            if(byte !== null) {
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
              if(parent_depth !== null) {
                while (parent_depth < this.depth){
                  this.depth -= 1;
                  this.constraint.popByte();
                }
                this.mode = MODE_BRANCH;
                continue outer;
              } else {
                while (0 < this.depth){
                  this.depth -= 1;
                  this.constraint.popByte();
                }
                return {done: true, value: undefined};
              }
        }
      }
  }
  };
}

export class Bindings {
  constructor(length, buffer = new Uint8Array(length*32)) {
    this.length = length;
    this.buffer = buffer;
  }

  get(offset) {
    return this.buffer.subarray(offset*32, (offset+1)*32);
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
    postProcessing = (r) => r
  ) {
    this.constraint = constraint;
    this.postProcessing = postProcessing;

    this.unexploredVariables = new ByteBitset();
    constraint.variables(this.unexploredVariables);
    const variableCount = this.unexploredVariables.count();

    this.bindings = new Bindings(variableCount);
  }

  *[Symbol.iterator] () {
    for (const r of this.__resolve()) {
      yield this.postProcessing(r);
    }
  }

  *__resolve() {
    if(this.unexploredVariables.isEmpty()) {
      yield this.bindings.copy();
    } else {
      let nextVariable;
      let nextVariableCosts = Number.MAX_VALUE;

      const variables = new ByteBitset();
      this.constraint.blocked(variables)
      variables.setSubtraction(this.unexploredVariables, variables);

      if(variables.isEmpty()) throw new Error("Can't evaluate query: blocked dead end.");
      
      for (const variable of variables.entries()) {
        const costs = this.constraint.countVariable(variable);
        if(costs <= nextVariableCosts) {
          nextVariable = variable;
          nextVariableCosts = costs;
        }
        if(nextVariableCosts <= 1) break;
      }

      this.unexploredVariables.unset(nextVariable);
      this.constraint.pushVariable(nextVariable);
      const segments = VariableIterator(this.constraint, this.bindings.get(nextVariable));
      for (const _ of segments) {
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
    this.upperBound = undefined;
    this.lowerBound = undefined;
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

  ranged({ lower, upper }) {
    this.lowerBound = lower;
    this.upperBound = upper;
    return this;
  }
  
  toString() {
    if(this.name) {
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
          if(variable) {
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
    if(!variable) {
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

      if(lowerBound !== undefined) {
        encodedLower = new Uint8Array(VALUE_SIZE);
        encoder(lowerBound, encodedLower);
      }
      if(upperBound !== undefined) {
        encodedUpper = new Uint8Array(VALUE_SIZE);
        encoder(upperBound, encodedUpper);
      }

      if(encodedLower !== undefined || encodedUpper !== undefined) {
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
    constraints.push(constraintBuilder(vars));
  }

  constraints.push(...vars.constraints());

  const constraint = new IntersectionConstraint(constraints);

  const postProcessing = (r) => {
    const result = {};
    for (const {
      index,
      decoder,
      name,
      blobcache,
    } of vars.namedVariables.values()) {
      const encoded = r.get(index);
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
          return (this[name] = decoded);
        },
      });
    }
    return result;
  };

  return new Query(constraint, postProcessing);
}
