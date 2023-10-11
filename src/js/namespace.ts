import { find, Variable } from "./query.ts";
import { and } from "./constraints/and.ts";
import { indexed } from "./constraints/indexed.ts";
import { masked } from "./constraints/masked.ts";
import { A, E, equalValue, TRIBLE_SIZE, V, Value, VALUE_SIZE } from "./trible.ts";
import { batch, batch, emptyValuePATCH, Entry, naturalOrder, PATCH, singleSegment } from "./patch.ts";
import { KB } from "./kb.ts";
import { IdSchema, Schema } from "./schemas.ts";
import { fixedUint8Array } from "./util.ts";

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

type AttributeDescription<Id> = {id: Id, schema: Schema<unknown>, isLink?: false, isMany?: boolean, isInverse?: false}
                          | {id: Id, isLink: true, isMany?: boolean, isInverse?: boolean};

type CompiledAttributeDescription<Id> = AttributeDescription<Id> & {encodedId: Value, name: string};

type NSDeclaration<Id> = {[id]: {schema: IdSchema<Id>},
                          string: AttributeDescription<Id>};

export class NS<Id> {
  constructor(decl: NSDeclaration<Id>) {
    const attributes = new Map(); // attribute name -> attribute description
    // non inverse attribute id -> [attribute description]
    let forwardAttributeIndex = emptyValuePATCH as PATCH<typeof VALUE_SIZE, typeof naturalOrder, typeof singleSegment, CompiledAttributeDescription<Id> & {isInverse?: false}>;
    // inverse attribute id -> [attribute description],
    let inverseAttributeIndex = emptyValuePATCH as PATCH<typeof VALUE_SIZE, typeof naturalOrder, typeof singleSegment, CompiledAttributeDescription<Id> & {isInverse?: false}>;

    const b = batch();

    const idDescription = decl[id];
    if (!idDescription) {
      throw Error(`Incomplete namespace: Missing [id] field.`);
    }
    if (!idDescription.schema) {
      throw Error(`Incomplete namespace: Missing [id] schema.`);
    }

    for (const [attributeName, attributeDescription] of Object.entries(decl)) {
      if (attributeDescription.isInverse && !attributeDescription.isLink) {
        throw Error(
          `Bad options in namespace attribute ${attributeName}:
                Only links can be inverse.`,
        );
      }
      if (!attributeDescription.isLink && !attributeDescription.schema) {
        throw Error(
          `Missing schema in namespace for attribute ${attributeName}.`,
        );
      }
      const encodedId = fixedUint8Array(VALUE_SIZE);
      idDescription.schema.encodeValue(attributeDescription.id, encodedId);
      const description = {
        ...attributeDescription,
        encodedId,
        name: attributeName,
      };
      attributes.set(attributeName, description);
      if (description.isInverse) {
        inverseAttributeIndex = inverseAttributeIndex.put(b,
          new Entry(description.encodedId, [
              ...(inverseAttributeIndex.get(description.encodedId) || []),
              description,
            ]));
      } else {
        forwardAttributeIndex = forwardAttributeIndex.put(b,
          new Entry(description.encodedId,
            [
              ...(forwardAttributeIndex.get(description.encodedId) || []),
              description,
            ]));
      }
    }

    for (const [_, attributeDescription] of attributes) {
      if (attributeDescription.isLink) {
        attributeDescription.schema = idDescription.schema;
      }
    }

    this.ids = idDescription;
    this.attributes = attributes;
    this.forwardAttributeIndex = forwardAttributeIndex;
    this.inverseAttributeIndex = inverseAttributeIndex;
  }

  *entityToTriples(
    unknowns,
    parentId,
    parentAttributeName,
    entity,
  ) {
    const entityId = entity[id] || unknowns.next().value;
    if (parentId !== null) {
      yield [parentId, parentAttributeName, entityId];
    }
    for (const [attributeName, value] of Object.entries(entity)) {
      const attributeDescription = this.attributes.get(attributeName);
      assert(
        attributeDescription,
        `No attribute named '${attributeName}' in namespace.`,
      );
      if (attributeDescription.isMany) {
        for (const v of value) {
          if (attributeDescription.isLink && isPojo(v)) {
            yield* this.entityToTriples(
              unknowns,
              entityId,
              attributeName,
              v,
            );
          } else {
            if (attributeDescription.isInverse) {
              yield [v, attributeName, entityId];
            } else {
              yield [entityId, attributeName, v];
            }
          }
        }
      } else {
        if (attributeDescription.isLink && isPojo(value)) {
          yield* this.entityToTriples(
            unknowns,
            entityId,
            attributeName,
            value,
          );
        } else {
          if (attributeDescription.isInverse) {
            yield [value, attributeName, entityId];
          } else {
            yield [entityId, attributeName, value];
          }
        }
      }
    }
  }

  *entitiesToTriples(unknowns, entities) {
    for (const entity of entities) {
      yield* this.entityToTriples(unknowns, null, null, entity);
    }
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

  triplesToPattern(ctx, triples) {
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

  pattern(ctx, source, entities) {
    const triples = this.entitiesToTriples(
      ctx.anonVars(),
      entities,
    );
    const { pattern, constraints } = this.triplesToPattern(ctx, triples);

    return and(...constraints, source.patternConstraint(pattern));
  }
}
