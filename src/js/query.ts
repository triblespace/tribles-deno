import { ByteBitset, ByteBitsetArray } from "./bitset.ts";
import { Entry, batch, emptyValuePATCH } from "./patch.ts";
import { ConstantConstraint, constant } from "./constraints/constant.ts";
import { and } from "./constraints/and.ts";
import { BlobCache } from "../../mod.ts";
import { Schema } from "./schemas.ts";
import { Value } from "./trible.ts";
import { FixedUint8Array, fixedUint8Array } from "./util.ts";
import { Constraint } from "./constraints/constraint.ts";
import { indexed } from "./constraints/indexed.ts";
import { assert } from "https://deno.land/std@0.180.0/_util/asserts.ts";

export const UPPER_START = 0;
export const UPPER_END = 16;

export const LOWER_START = 16;
export const LOWER_END = 32;

export const UPPER = (value) => value.subarray(UPPER_START, UPPER_END);
export const LOWER = (value) => value.subarray(LOWER_START, LOWER_END);

/**
 * Assigns values to variables.
 */
export class Binding {
  length: number;
  buffer: Uint8Array;

  constructor(length: number, buffer = new Uint8Array(32 + length * 32)) {
    this.length = length;
    this.buffer = buffer;
  }

  bound(): ByteBitset {
    return new ByteBitset(new Uint32Array(this.buffer.buffer, 0, 8));
  }

  get<T>(variable_index: number): Value {
    return this.buffer.subarray(32 + variable_index * 32, 32 + (variable_index + 1) * 32) as Value;
  }

  set<T>(variable_index: number, value: Value) {
    const copy = this.copy();
    copy.get(variable_index).set(value);
    copy.bound().set(variable_index);
    return copy;
  }

  copy(): Binding {
    return new Binding(this.length, this.buffer.slice());
  }
}

type PostProcessing<R> = (ctx: VariableContext, binding: Binding) => R;

/**
 * A query represents the process of finding variable asignment
 * that satisfy the provided constraints.
 * A postprocessing function takes the raw binding of `UintArray(32)` values
 * and turns them into usable javascript types.
 */
export class Query<R> {
  ctx: VariableContext;
  constraint: Constraint;
  postprocessing: PostProcessing<R>;
  variables: ByteBitset;

  constructor(
    ctx: VariableContext,
    constraint: Constraint,
    postprocessing: PostProcessing<R>,
  ) {
    this.ctx = ctx;
    this.constraint = constraint;
    this.postprocessing = postprocessing;

    this.variables = constraint.variables();
  }

  *[Symbol.iterator]() {
    for (const binding of this.bindAll(new Binding(this.variables.count()))) {
      yield this.postprocessing(this.ctx, binding);
    }
  }

  *bindAll(binding: Binding) {
    const boundVariables = binding.bound();
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

    if (nextVariable === undefined) {
      yield binding;
    } else {
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
export class Variable<T> {
  context: VariableContext
  index: number;
  name: string | undefined;
  blobcache: BlobCache | undefined;
  schema: Schema<T> | undefined;
  constant: T | undefined;

  constructor(context: VariableContext, index: number, name: string | undefined = undefined) {
    this.context = context;
    this.index = index;
    this.name = name;
    this.blobcache = undefined;
    this.schema = undefined;
    this.constant = undefined;
  }

  /**
   * Returns a string representation for this variable.
   */
  toString() {
    if (this.name == undefined) {
      return `__anon__@${this.index}`;
    }
    return `${this.name}@${this.index}`;
  }

  /**
   * Associates this variable with a type, e.g. a decoder and encoder.
   */
  typed(schema: Schema<T>) {
    this.schema = schema;
    return this;
  }

  /**
   * Associate this variable with a blobcache.
   * The blobcache will be used when the decoder used for it
   * requests the blob associated with it's value.
   */
  proposeBlobCache(blobcache: BlobCache) {
    // Todo check latency cost of blobcache, e.g. inMemory vs. S3.
    this.blobcache = blobcache;
    return this;
  }

  /**
   * Create a constraint for the given variable to the provided constant value.
   */
  is(constant: Value): Constraint {
    return new ConstantConstraint(this.index, constant);
  }

  /**
   * Create a constraint for the given variable to the provided collection of values.
   */
  of(collection: Iterable<T>): Constraint {
    assert(this.schema);
    const b = batch();
    const index = emptyValuePATCH;
    for (const constant of collection) {
      const value = fixedUint8Array(32);
      this.schema.encodeValue(constant, value);
      index.put(b, new Entry(value, undefined));
    }
    return indexed(this, index);
  }
}

/**
 * Represents a collection of Variables used together, e.g. in a query.
 * Can be used to generate named an unnamed variables.
 */
export class VariableContext {
  nextVariableIndex: number;
  // deno-lint-ignore no-explicit-any
  variables: Variable<any>[];
  // deno-lint-ignore no-explicit-any
  unnamedVariables: Variable<any>[];
  // deno-lint-ignore no-explicit-any
  namedVariables: Map<string, Variable<any>> = new Map();
  constantVariables: typeof emptyValuePATCH;

  constructor() {
    this.nextVariableIndex = 0;
    this.variables = [];
    this.unnamedVariables = [];
    this.namedVariables = new Map();
    this.constantVariables = emptyValuePATCH;
  }

  namedVar<T>(name: string): Variable<T> {
    let variable = this.namedVariables.get(name);
    if (variable) {
      return variable;
    }
    variable = new Variable(this, this.nextVariableIndex, name);
    this.namedVariables.set(name, variable);
    this.variables.push(variable);
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
    // deno-lint-ignore no-this-alias
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
 */
type QueryFn = (ctx: VariableContext, namedVars: { [name: string]: Variable<unknown>; }, anonVars: Iterable<Variable<unknown>>) => Constraint;

/**
 * Create an iterable query object from the provided constraint function.
 * @param queryfn - A function representing the query.
 * @param postprocessing - A function that maps over the query results and coverts them to usable values.
 * @returns Enumerates possible variable assignments satisfying the input query.
 */
export function find(queryfn: QueryFn, postprocessing: PostProcessing<unknown> = decodeWithBlobcache): Query<unknown> {
  const ctx = new VariableContext();
  const queryConstraint = queryfn(ctx, ctx.namedVars(), ctx.anonVars());
  return new Query(ctx, queryConstraint, postprocessing);
}
