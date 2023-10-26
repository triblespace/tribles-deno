import { ByteBitset } from "./bitset.ts";
import { batch, emptyValuePATCH, Entry } from "./patch.ts";
import { ConstantConstraint } from "./constraints/constant.ts";
import { BlobCache } from "../../mod.ts";
import { Schema } from "./schemas.ts";
import { Value } from "./trible.ts";
import { fixedUint8Array } from "./util.ts";
import { Constraint } from "./constraints/constraint.ts";
import { indexed } from "./constraints/indexed.ts";
import { assert } from "https://deno.land/std@0.180.0/_util/asserts.ts";

export const UPPER_START = 0;
export const UPPER_END = 16;

export const LOWER_START = 16;
export const LOWER_END = 32;

export const UPPER = (value: Value) => value.subarray(UPPER_START, UPPER_END);
export const LOWER = (value: Value) => value.subarray(LOWER_START, LOWER_END);

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

  get<T>(variable_index: number): Value | undefined {
    if (this.bound().has(variable_index)) {
      return this.buffer.subarray(
        32 + variable_index * 32,
        32 + (variable_index + 1) * 32,
      ) as Value;
    }
  }

  set<T>(variable_index: number, value: Value) {
    const copy = this.copy();
    this.buffer.subarray(
      32 + variable_index * 32,
      32 + (variable_index + 1) * 32,
    ).set(value);
    copy.bound().set(variable_index);
    return copy;
  }

  copy(): Binding {
    return new Binding(this.length, this.buffer.slice());
  }
}

/**
 * A variable is a placeholder in a constraint that
 * gets assigned different values when a query is evaluated.
 */
export class Variable<T> {
  context: VariableContext;
  index: number;
  name: string | undefined;
  blobcache: BlobCache | undefined;
  schema: Schema<T> | undefined;
  constant: T | undefined;

  constructor(
    context: VariableContext,
    index: number,
    name: string | undefined = undefined,
  ) {
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
  typed(schema: Schema<T>): Variable<T> {
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
      index.put(new Entry(value, undefined), b);
    }
    return indexed(this, index);
  }
}

// deno-lint-ignore no-explicit-any
type NamedVars = { [name: string]: Variable<any> };
// deno-lint-ignore no-explicit-any
type AnonVars = { [index: number]: Variable<any> } & any[];

/**
 * Represents a collection of Variables used together, e.g. in a query.
 * Can be used to generate named an unnamed variables.
 */
export class VariableContext {
  // deno-lint-ignore no-explicit-any
  variables: Variable<any>[];
  namedVariables: NamedVars = {};

  constructor() {
    this.variables = [];
    this.namedVariables = {};
  }

  namedVar<T>(name: string): Variable<T> {
    let variable: Variable<T> | undefined = this.namedVariables[name];
    if (variable !== undefined) {
      return variable;
    }
    variable = new Variable(this, this.variables.length, name);
    this.namedVariables[name] = variable;
    this.variables.push(variable);
    return variable;
  }

  anonVar<T>(): Variable<T> {
    const variable: Variable<T> = new Variable(this, this.variables.length);
    this.variables.push(variable);
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
  namedVars(): NamedVars {
    return new Proxy(
      {},
      {
        get: (_, name: string) => {
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
  // deno-lint-ignore no-explicit-any
  anonVars(): Iterable<Variable<any>> & Iterator<Variable<any>> {
    // deno-lint-ignore no-this-alias
    const self = this;
    // deno-lint-ignore no-explicit-any
    const iter: Iterable<Variable<any>> & Iterator<Variable<any>> = {
      [Symbol.iterator]() {
        return this;
      },
      next() {
        return { value: self.anonVar() };
      },
    };

    return iter;
  }
}

// deno-lint-ignore no-explicit-any
type VariableT<V extends Variable<any>> = V extends Variable<infer T> ? T
  : never;
type Results<V extends NamedVars> = { [K in keyof V]: VariableT<V[K]> };

/**
 * A query represents the process of finding variable asignment
 * that satisfy the provided constraints.
 */
export class Query<V extends NamedVars> {
  ctx: VariableContext;
  constraint: Constraint;
  variables: ByteBitset;

  constructor(
    ctx: VariableContext,
    constraint: Constraint,
  ) {
    this.ctx = ctx;
    this.constraint = constraint;

    this.variables = constraint.variables();
  }

  *bindAll(binding: Binding): Iterable<Binding> {
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
      yield binding; //TODO we should probably copy here instead.
    } else {
      for (const value of this.constraint.propose(nextVariable, binding)) {
        yield* this.bindAll(binding.copy().set(nextVariable, value));
      }
    }
  }

  *[Symbol.iterator](): Iterator<Results<V>> {
    for (const binding of this.bindAll(new Binding(this.variables.count()))) {
      const result: { [K in keyof V]?: VariableT<V[K]> } = {};
      for (
        const entry of Object.entries(this.ctx.namedVariables as V)
      ) {
        const name: keyof V = entry[0];
        const {
          index,
          schema,
          blobcache,
        } = entry[1];
        if (schema === undefined) {
          throw Error("untyped Variable in query");
        }
        if (blobcache === undefined) {
          throw Error("missing blobcache for Variable in query");
        }
        const encoded = binding.get(index);
        if (encoded === undefined) {
          throw Error("variable not bound after evaluation");
        }

        const decoded = schema.decodeValue(
          encoded,
          // Note that there is a potential attack vector here, if we ever want to do query level access control.
          // An attacker could change the encoder to manipulate the encoded array and request a different blob.
          // This would be solved by freezing the Array, but since it's typed and the spec designers unimaginative...
          async () => await blobcache.get(encoded),
        );
        result[name] = decoded;
      }
      yield result as Results<V>;
    }
  }
}

/**
 * Gets passed an object that can be destructured for variable names and
 * returns a constraint builder that can be used to enumerate query results
 * with a call to find.
 */
type QueryFn<N extends NamedVars, A extends AnonVars> = (
  ctx: VariableContext,
  namedVars: N,
  anonVars: A,
) => Constraint;

/**
 * Create an iterable query object from the provided constraint function.
 * @param queryfn - A function representing the query.
 * @param postprocessing - A function that maps over the query results and coverts them to usable values.
 * @returns Enumerates possible variable assignments satisfying the input query.
 */
export function find<N extends NamedVars, A extends AnonVars>(
  queryfn: QueryFn<N, A>,
): Query<N> {
  const ctx = new VariableContext();
  const queryConstraint = queryfn(
    ctx,
    ctx.namedVars() as N,
    ctx.anonVars() as unknown as A,
  );
  return new Query<N>(ctx, queryConstraint);
}
