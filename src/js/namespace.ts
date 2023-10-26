import { Variable, VariableContext } from "./query.ts";
import { and } from "./constraints/and.ts";
import {
  A,
  Blob,
  E,
  Trible,
  TRIBLE_SIZE,
  V,
  Value,
  VALUE_SIZE,
} from "./trible.ts";
import { KB } from "./kb.ts";
import { IdSchema, Schema } from "./schemas.ts";
import { fixedUint8Array } from "./util.ts";
import { Constraint } from "./constraints/constraint.ts";

export const id: unique symbol = Symbol("id");

class IDSequence<T> implements Iterator<T> {
  schema: IdSchema<T>;

  constructor(schema: IdSchema<T>) {
    this.schema = schema;
  }

  [Symbol.iterator]() {
    return this;
  }
  next() {
    return { value: this.schema.factory() };
  }
}

type AttributeDescription<Id, T> = { id: Id; schema: Schema<T> };

// deno-lint-ignore no-explicit-any
type NSDeclaration<Id> = { [index: string]: AttributeDescription<Id, any> };

// deno-lint-ignore no-explicit-any
type SchemaT<S extends Schema<any>> = S extends Schema<infer T> ? T : never;

type VariableOrValue<Vars extends false | true, T> = Vars extends true
  ? Variable<T> | T
  : T;

type Unknowns<Vars, T> = Iterator<Vars extends true ? T | Variable<T> : T>;

type Triple<Vars extends boolean, Id, Decl extends NSDeclaration<Id>> = {
  [Name in keyof Decl]: [
    VariableOrValue<Vars, Id>,
    Name & string,
    VariableOrValue<Vars, SchemaT<Decl[Name]["schema"]>>,
  ];
}[keyof Decl];

type EntityDescription<
  Vars extends boolean,
  Id,
  Decl extends NSDeclaration<Id>,
> =
  & { [id]?: VariableOrValue<Vars, Id> }
  & {
    [Name in keyof Decl]+?: VariableOrValue<
      Vars,
      SchemaT<Decl[Name]["schema"]>
    >;
  };

export class NS<Id, Decl extends NSDeclaration<Id>> {
  ids: IdSchema<Id>;
  attributes: Decl;
  constructor(id: IdSchema<Id>, attributes: Decl) {
    this.ids = id;
    this.attributes = attributes;
  }

  entityToTriples<Vars extends boolean>(
    out: Triple<Vars, Id, Decl>[],
    unknowns: Unknowns<Vars, unknown>,
    entityDescription: EntityDescription<Vars, Id, Decl>,
  ) {
    const entity: VariableOrValue<Vars, Id> = entityDescription[id] ||
      unknowns.next().value;
    for (const entry of Object.entries(entityDescription)) {
      const attributeName: keyof Decl & string = entry[0];
      const value = entry[1];
      if (value !== undefined) {
        const triple: Triple<Vars, Id, Decl> = [entity, attributeName, value];
        out.push(triple);
      }
    }
  }

  entitiesToTriples<Vars extends boolean>(
    unknowns: Unknowns<Vars, unknown>,
    entities: EntityDescription<Vars, Id, Decl>[],
  ): Triple<Vars, Id, Decl>[] {
    const triples: Triple<Vars, Id, Decl>[] = [];

    for (const entity of entities) {
      this.entityToTriples(triples, unknowns, entity);
    }

    return triples;
  }

  triplesToTribles(
    triples: Triple<false, Id, Decl>[],
  ): { tribles: Trible[]; blobs: [Trible, Blob][] } {
    const tribles = [];
    const blobs: [Trible, Blob][] = [];
    for (const [e, a, v] of triples) {
      const attributeDescription = this.attributes[a];

      const trible = fixedUint8Array(TRIBLE_SIZE);
      this.ids.encodeId(e, E(trible));
      this.ids.encodeId(attributeDescription.id, A(trible));

      let blob;
      try {
        blob = attributeDescription.schema.encodeValue(v, V(trible));
      } catch (err) {
        throw Error(
          `Couldn't encode '${v}' as value for attribute '${a}':\n${err}`,
        );
      }

      tribles.push(trible);
      if (blob) {
        blobs.push([trible, blob]);
      }
    }
    return { tribles, blobs };
  }

  triplesToPattern(
    ctx: VariableContext,
    triples: readonly Triple<true, Id, Decl>[],
  ): {
    pattern: (readonly [
      Variable<Id>,
      Variable<Id>,
      Variable<SchemaT<Decl[keyof Decl]["schema"]>>,
    ])[];
    constraints: Constraint[];
  } {
    const pattern = [];
    const constraints = [];
    for (const [e, a, v] of triples) {
      const attributeDescription = this.attributes[a];

      // Entity
      let eVar: Variable<Id>;
      if (e instanceof Variable) {
        eVar = e.typed(this.ids);
      } else {
        const eb = fixedUint8Array(VALUE_SIZE);
        this.ids.encodeValue(e, eb);
        eVar = ctx.anonVar();
        eVar.typed(this.ids);
        constraints.push(eVar.is(eb));
      }

      // Attribute
      const ab = fixedUint8Array(VALUE_SIZE);
      this.ids.encodeValue(attributeDescription.id, ab);
      const aVar: Variable<Id> = ctx.anonVar();
      aVar.typed(this.ids);
      constraints.push(aVar.is(ab));

      // Value
      let vVar: Variable<SchemaT<(typeof this.attributes[typeof a])["schema"]>>;
      if (v instanceof Variable) {
        vVar = v.typed(attributeDescription.schema);
      } else {
        const vb = fixedUint8Array(VALUE_SIZE);
        try {
          attributeDescription.schema.encodeValue(v, vb);
        } catch (error) {
          throw Error(`Error encoding value: ${error.message}`);
        }
        vVar = ctx.anonVar();
        vVar.typed(this.attributes[a]["schema"]);
        constraints.push(vVar.is(vb));
      }
      pattern.push([eVar, aVar, vVar] as const);
    }

    return { pattern, constraints };
  }

  /**
   * Generates entities to be inserted into a KB.
   *
   * @callback entityGenerator
   * @param {IDSequence} ids
   * @yields {Object}
   */

  /**
   * Returns a collection of entities.
   *
   * @callback entityFunction
   * @param {IDSequence} ids
   * @returns {Array}
   */

  /**
   * Converts the provided entities into tribles and blobs.
   * @param entities - A function/generator returning/yielding entities.
   * @returns A new KB with the entities.
   */
  entities(
    entities: (unknowns: Iterable<Id>) => EntityDescription<false, Id, Decl>[],
    kb: KB = new KB(),
  ): KB {
    const ids = new IDSequence(this.ids);
    const createdEntities = entities(ids);
    const triples = this.entitiesToTriples(
      ids,
      createdEntities,
    );
    const { tribles, blobs } = this.triplesToTribles(triples);

    const newBlobCache = kb.blobcache.with(blobs);
    const newTribleSet = kb.tribleset.with(tribles);
    return new KB(newTribleSet, newBlobCache);
  }

  pattern(
    ctx: VariableContext,
    source: KB,
    entities: EntityDescription<true, Id, Decl>[],
  ) {
    const triples = this.entitiesToTriples(
      ctx.anonVars(),
      entities,
    );
    const { pattern, constraints } = this.triplesToPattern(ctx, triples);

    return and(...constraints, source.patternConstraint(pattern));
  }
}
