import { find, Variable, VariableContext } from "./query.ts";
import { and } from "./constraints/and.ts";
import { indexed } from "./constraints/indexed.ts";
import { masked } from "./constraints/masked.ts";
import { A, E, equalValue, TRIBLE_SIZE, V, Value, VALUE_SIZE } from "./trible.ts";
import { batch, batch, emptyValuePATCH, Entry, naturalOrder, PATCH, singleSegment } from "./patch.ts";
import { KB } from "./kb.ts";
import { IdSchema, Schema } from "./schemas.ts";
import { assert, fixedUint8Array } from "./util.ts";

export const id = Symbol("id");

// deno-lint-ignore no-explicit-any
const isPojo = (obj: any): boolean => {
  if (obj === null || typeof obj !== "object") {
    return false;
  }
  return Object.getPrototypeOf(obj) === Object.prototype;
};

class IDSequence<T> {
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

type IfEquals<T, U, Y=unknown, N=never> =
  (<G>() => G extends T ? 1 : 2) extends
  (<G>() => G extends U ? 1 : 2) ? Y : N;

type AttributeDescription<Id, T> = {id: Id, schema: Schema<T>};

type CompiledAttributeDescription<Id, T> = AttributeDescription<Id, T> & {encodedId: Value, name: string, isLink: boolean};

// deno-lint-ignore no-explicit-any
type NSDeclaration<Id> = {[index: string]: AttributeDescription<Id, any>};

// deno-lint-ignore no-explicit-any
type SchemaT<S extends Schema<any>> = S extends Schema<infer T> ? T : unknown;

// deno-lint-ignore no-explicit-any
type AttrByName<Id> = {[index: string]: CompiledAttributeDescription<Id, any>};

type Triple<Id, Decl extends NSDeclaration<Id>> =
  {[Name in keyof Decl]: [Id | Variable<Id>, Name, Variable<SchemaT<Decl[Name]["schema"]>> | SchemaT<Decl[Name]["schema"]>]}[keyof Decl];

type EntityDescription<Id, Decl extends NSDeclaration<Id>> = 
  {[id]?: Id} &
  {
    [Name in keyof Decl]+?: IfEquals<SchemaT<Decl[Name]["schema"]>,
      Id,SchemaT<Decl[Name]["schema"]>,
      EntityDescription<Id, Decl>>;
  };

export class NS<Id, Decl extends NSDeclaration<Id>> {
  idSchema: IdSchema<Id>;
  byName: AttrByName<Id>;
  // deno-lint-ignore no-explicit-any
  byId: PATCH<typeof VALUE_SIZE, typeof naturalOrder, typeof singleSegment, CompiledAttributeDescription<Id, any>[]>; 
  constructor(idSchema: IdSchema<Id>, decl: Decl) {
    // attribute name -> attribute description
    // deno-lint-ignore no-explicit-any
    const byName: {[index: string]: CompiledAttributeDescription<Id, any>} = {};
    // attribute id -> [attribute description]
    // deno-lint-ignore no-explicit-any
    let byId = emptyValuePATCH as PATCH<typeof VALUE_SIZE, typeof naturalOrder, typeof singleSegment, CompiledAttributeDescription<Id, any>[]>;

    const b = batch();

    for (const [attributeName, attributeDescription] of Object.entries(decl)) {
      if (!attributeDescription.schema) {
        throw Error(
          `Missing schema in namespace for attribute ${attributeName}.`,
        );
      }
      const encodedId = fixedUint8Array(VALUE_SIZE);
      idSchema.encodeValue(attributeDescription.id, encodedId);
      const description = {
        ...attributeDescription,
        encodedId,
        name: attributeName,
        isLink: idSchema === attributeDescription.schema
      };
      byName[attributeName] = description;
      const byIdAttributes = byId.get(description.encodedId) || [];
      byIdAttributes.push(description);
      byId = byId.put(b, new Entry(description.encodedId, byIdAttributes));
    }

    this.idSchema = idSchema;
    this.byName = byName;
    this.byId = byId;
  }

  *entityToTriples(
    out: Triple<Id, Decl>[],
    unknowns: Iterator<Id | Variable<Id>>,
    parent: Id | Variable<Id> | undefined,
    parentAttributeName: string | undefined,
    entityDescription: EntityDescription<Id, Decl>,
  ) {
    const entity = entityDescription[id] || unknowns.next().value;
    if (parent !== undefined) {
      yield [parent, parentAttributeName, entity];
    }
    for (const [attributeName, value] of Object.entries(entityDescription)) {
      const attributeDescription = this.attributes.get(attributeName);
      assert(
        attributeDescription,
        `No attribute named '${attributeName}' in namespace.`,
      );
      if (attributeDescription.isMany) {
        for (const v of value) {
          if (attributeDescription.isLink && isPojo(v)) {
            yield* this.entityToTriples(
              out,
              unknowns,
              entity,
              attributeName,
              v,
            );
          } else {
            yield [entity, attributeName, v];
          }
        }
      } else {
        if (attributeDescription.isLink && isPojo(value)) {
          yield* this.entityToTriples(
            out,
            unknowns,
            entity,
            attributeName,
            value,
          );
        } else {
          yield [entity, attributeName, value];
        }
      }
    }
  }

  entitiesToTriples(unknowns: Iterator<Id, Variable<Id>>, entities: EntityDescription<Id, Decl>[]): Triple<Id, Decl>[] {
    const triples: Triple<Id, Decl>[] = [];

    for (const entity of entities) {
      this.entityToTriples(triples, unknowns, undefined, undefined, entity);
    }

    return triples;
  }

  triplesToTribles(triples) {
    const tribles = [];
    const blobs = [];
    const { encoder: idEncoder } = this.ids;
    for (const [e, a, v] of triples) {
      const attributeDescription = this.attributes.get(a);

      const trible = new Uint8Array(TRIBLE_SIZE);
      const eb = new Uint8Array(VALUE_SIZE);
      idEncoder(e, eb);
      E(trible).set(eb.subarray(16, 32));
      A(trible).set(attributeDescription.encodedId.subarray(16, 32));
      const encodedValue = V(trible);
      let blob;
      const encoder = attributeDescription.encoder;
      try {
        blob = encoder(v, encodedValue);
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

  triplesToPattern(ctx, triples): [Variable<unknown>, Variable<unknown>, Variable<unknown>][] {
    const { encoder: idEncoder } = this.ids;
    const pattern = [];
    const constraints = [];
    for (const [e, a, v] of triples) {
      const attributeDescription = this.attributes.get(a);
      let eVar;
      let aVar;
      let vVar;

      // Entity
      if (e instanceof Variable) {
        eVar = e.typed(this.ids);
      } else {
        const eb = new Uint8Array(VALUE_SIZE);
        idEncoder(e, eb);
        eVar = ctx.constantVar(eb);
      }

      // Attribute
      aVar = ctx.constantVar(attributeDescription.encodedId);

      // Value
      if (v instanceof Variable) {
        vVar = v.typed(attributeDescription);
      } else {
        const encoder = attributeDescription.encoder;
        const vb = new Uint8Array(VALUE_SIZE);
        try {
          encoder(v, vb);
        } catch (error) {
          throw Error(`Error encoding value: ${error.message}`);
        }
        vVar = ctx.constantVar(vb);
      }
      pattern.push([eVar, aVar, vVar]);
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
   * @param {entityFunction | entityGenerator} entities - A function/generator returning/yielding entities.
   * @returns {KB} A new KB with the entities.
   */
  entities(entities, kb = new KB()) {
    const ids = new IDSequence(this.ids.factory);
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

  // deno-lint-ignore no-explicit-any
  pattern(ctx: VariableContext, source: KB, entities: any) {
    const triples = this.entitiesToTriples(
      ctx.anonVars(),
      entities,
    );
    const { pattern, constraints } = this.triplesToPattern(ctx, triples);

    return and(...constraints, source.patternConstraint(pattern));
  }
}
