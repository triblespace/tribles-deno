import { ByteBitset, ByteBitsetArray } from "./bitset.js";
import { incValue } from "./trible.js";

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

const ZERO = new Uint8Array(32);

/**
 * A query represents the process of finding variable asignment
 * that satisfy the provided constraints.
 * A postprocessing function takes the raw binding of `UintArray(32)` values
 * and turns them into usable javascript types.
 */
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
      let value = this.constraint.seek(ZERO);
      while (value) {
        this.bindings.set(nextVariable, value);
         yield* this.__resolve();
        let value = this.constraint.seek(incValue(value));
      }
      this.constraint.popVariable();
      this.unexploredVariables.set(nextVariable);
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
 * An anonymous sequence of variables returned by `VariableContext.anonVars`.
 */
class AnonSequence {
  constructor(context) {
    this.context = context;
  }

  [Symbol.iterator]() {
    return this;
  }
  next() {
    const variable = new Variable(
      this.context,
      this.context.nextVariableIndex,
    );
    this.context.unnamedVariables.push(variable);
    this.context.variables.push(variable);
    this.context.nextVariableIndex++;
    return { value: variable };
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
    this.constantVariables = [];
    this.isBlocking = [];
    this.projected = new Set();
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
    return new AnonSequence(this);
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
  const vars = new VariableContext();
  const constraint = queryfn(vars.namedVars(), vars.anonVars());
  return new Query(constraint, vars, postprocessing);
}
