import { ByteBitset, ByteBitsetArray } from "./bitset.ts";
import { emptyValuePATCH } from "./patch.ts";
import { constant } from "./constraints/constant.ts";
import { and } from "./constraints/and.ts";

export const UPPER_START = 0;
export const UPPER_END = 16;

export const LOWER_START = 16;
export const LOWER_END = 32;

export const UPPER = (value) => value.subarray(UPPER_START, UPPER_END);
export const LOWER = (value) => value.subarray(LOWER_START, LOWER_END);

/**
 * Assigns values to variables.
 */
export class Bindings {
  constructor(length, buffer = new Uint8Array(32 + length * 32)) {
    this.length = length;
    this.buffer = buffer;
  }

  bound() {
    return new ByteBitset(new UInt32Array(this.buffer.buffer, 0, 8));
  }

  get(variable) {
    return this.buffer.subarray(32 + variable * 32, 32 + (variable + 1) * 32);
  }

  set(variable, value) {
    let copy = this.copy();
    copy.get(variable).set(value);
    copy.bound().set(variable);
    return copy;
  }

  copy() {
    return new Bindings(this.length, this.buffer.slice());
  }
}

/**
 * A query represents the process of finding variable asignment
 * that satisfy the provided constraints.
 * A postprocessing function takes the raw binding of `UintArray(32)` values
 * and turns them into usable javascript types.
 */
export class Query {
  constructor(
    constraint,
    ctx,
    postprocessing = (r) => r,
  ) {
    this.constraint = constraint;
    this.ctx = ctx;
    this.postprocessing = postprocessing;

    this.variables = constraint.variables();
  }

  *[Symbol.iterator]() {
    for (const binding of this.bindAll(new Bindings(this.variables.count()))) {
      yield this.postprocessing(this.ctx, binding);
    }
  }

  *bindAll(binding) {
    const boundVariables = binding.bound();
    if (this.variables.isEqual(boundVariables)) {
      yield this.binding;
    } else {
      let nextVariable;
      let nextVariableCosts = Number.MAX_VALUE;

      const unboundVariables = new ByteBitset().setSubtraction(
        this.variables,
        boundVariables,
      );

      for (const variable of unboundVariables.entries()) {
        const costs = this.constraint.estimate(variable, binding);
        if (costs <= nextVariableCosts) {
          nextVariable = variable;
          nextVariableCosts = costs;
        }
        if (nextVariableCosts <= 1) break;
      }

      for (const value of this.constraint.propose(nextVariable, binding)) {
        yield* this.bindAll(binding.copy().set(nextVariable, value));
      }
    }
  }
}

/**
 * A variable is a placeholder in a constraint that
 * gets assigned different values when a query is evaluated.
 */
export class Variable {
  constructor(context, index, name = null) {
    this.context = context;
    this.index = index;
    this.name = name;
    this.decoder = null;
    this.encoder = null;
    this.blobcache = null;
    this.constant = null;
  }

  /**
   * Returns a string representation for this variable.
   */
  toString() {
    if (this.name) {
      return `${this.name}@${this.index}`;
    }
    return `__anon__@${this.index}`;
  }

  /**
   * Associates this variable with a type, e.g. a decoder and encoder.
   */
  typed({ encoder, decoder }) {
    this.encoder = encoder;
    this.decoder = decoder;
    return this;
  }

  /**
   * Associate this variable with a blobcache.
   * The blobcache will be used when the decoder used for it
   * requests the blob associated with it's value.
   */
  proposeBlobCache(blobcache) {
    // Todo check latency cost of blobcache, e.g. inMemory vs. S3.
    this.blobcache ||= blobcache;
    return this;
  }
}

/**
 * Represents a collection of Variables used together, e.g. in a query.
 * Can be used to generate named an unnamed variables.
 */
export class VariableContext {
  constructor() {
    this.nextVariableIndex = 0;
    this.variables = [];
    this.unnamedVariables = [];
    this.namedVariables = new Map();
    this.constantVariables = emptyValuePATCH;
    this.isBlocking = [];
    this.projected = new Set();
  }

  namedVar(name) {
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
  }

  anonVar() {
    const variable = new Variable(
      this,
      this.nextVariableIndex,
    );
    this.unnamedVariables.push(variable);
    this.variables.push(variable);
    this.nextVariableIndex++;
    return variable;
  }

  constantVar(constant) {
    let variable = this.constantVariables.get(constant);
    if (!variable) {
      variable = new Variable(this, this.nextVariableIndex);
      variable.constant = constant;
      this.constantVariables = this.constantVariables.put(constant, variable);
      this.variables.push(variable);
      this.nextVariableIndex++;
    }
    return variable;
  }

  /**
   * Returns an proxy object that generates named variables.
   * Using the same name twice will return the same variable.
   * ---
   * Hint:
   * Use destructuring to access the variables.
   * ```js
   * const context = new VariableContext();
   * const {named1, named2} = context.namedVars();
   * ```
   */
  namedVars() {
    return new Proxy(
      {},
      {
        get: (_, name) => {
          return this.namedVar(name);
        },
      },
    );
  }

  /**
   * Returns an infinite sequence of anonymous variables.
   * ---
   * Hint:
   * Use destructuring to access the variables.
   * ```js
   * const context = new VariableContext();
   * const [anon1, anon2] = context.anonVars();
   * ```
   */
  anonVars() {
    const self = this;
    return {
      [Symbol.iterator]() {
        return this;
      },
      next() {
        return { value: self.anonVar() };
      },
    };
  }

  constraints() {
    const constraints = [];

    for (const constantVariable of this.constantVariables.values()) {
      constraints.push(
        constant(constantVariable, constantVariable.constant),
      );
    }

    return constraints;
  }
}

/**
 * Decodes the passed bindings based on the types associated with the passed variables.
 * Uses the blobcache proposed to individual variables when their type has associated blobs.
 */
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
  const ctx = new VariableContext();
  const queryConstraint = queryfn(ctx, ctx.namedVars(), ctx.anonVars());
  const ctxConstraints = ctx.constraints();
  const constraint = and(queryConstraint, ...ctxConstraints);
  return new Query(constraint, ctx, postprocessing);
}