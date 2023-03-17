import {
  constantConstraint,
  indexConstraint,
  IntersectionConstraint,
  MaskedConstraint,
  Query,
  Variable,
} from "./query.js";
import { A, E, equalValue, TRIBLE_SIZE, V, VALUE_SIZE } from "./trible.js";
import { emptyValuePACT } from "./pact.js";
import { TribleSet } from "./tribleset.js";
import { BlobCache } from "./blobcache.js";
import { KB } from "./kb.js";

const assert = (test, message) => {
  if (!test) {
    throw Error(message);
  }
};

export const id = Symbol("id");

const isPojo = (obj) => {
  if (obj === null || typeof obj !== "object") {
    return false;
  }
  return Object.getPrototypeOf(obj) === Object.prototype;
};

class IDSequence {
  constructor(factory) {
    this.factory = factory;
  }

  [Symbol.iterator]() {
    return this;
  }
  next() {
    return { value: this.factory() };
  }
}

export class NS {
  constructor(decl) {
    const attributes = new Map(); // attribute name -> attribute description
    let forwardAttributeIndex = emptyValuePACT; // non inverse attribute id -> [attribute description]
    let inverseAttributeIndex = emptyValuePACT; // inverse attribute id -> [attribute description],
    const newUniqueAttributeIndex = emptyValuePACT.batch();
    const newUniqueInverseAttributeIndex = emptyValuePACT.batch();

    const idDescription = decl[id];
    if (!idDescription) {
      throw Error(`Incomplete namespace: Missing [id] field.`);
    }
    if (!idDescription.decoder) {
      throw Error(`Incomplete namespace: Missing [id] decoder.`);
    }
    if (!idDescription.encoder) {
      throw Error(`Incomplete namespace: Missing [id] encoder.`);
    }
    if (!idDescription.factory) {
      throw Error(`Incomplete namespace: Missing [id] factory.`);
    }

    for (const [attributeName, attributeDescription] of Object.entries(decl)) {
      if (attributeDescription.isInverse && !attributeDescription.isLink) {
        throw Error(
          `Bad options in namespace attribute ${attributeName}:
                Only links can be inversed.`,
        );
      }
      if (!attributeDescription.isLink && !attributeDescription.decoder) {
        throw Error(
          `Missing decoder in namespace for attribute ${attributeName}.`,
        );
      }
      if (!attributeDescription.isLink && !attributeDescription.encoder) {
        throw Error(
          `Missing encoder in namespace for attribute ${attributeName}.`,
        );
      }
      const encodedId = new Uint8Array(VALUE_SIZE);
      idDescription.encoder(attributeDescription.id, encodedId);
      const description = {
        ...attributeDescription,
        encodedId,
        name: attributeName,
      };
      attributes.set(attributeName, description);
      if (description.isInverse) {
        inverseAttributeIndex = inverseAttributeIndex.put(
          description.encodedId,
          [
            ...(inverseAttributeIndex.get(description.encodedId) || []),
            description,
          ],
        );
      } else {
        forwardAttributeIndex = forwardAttributeIndex.put(
          description.encodedId,
          [
            ...(forwardAttributeIndex.get(description.encodedId) || []),
            description,
          ],
        );
      }
    }

    for (const [_, attributeDescription] of attributes) {
      if (attributeDescription.isLink) {
        attributeDescription.encoder = idDescription.encoder;
        attributeDescription.decoder = idDescription.decoder;
      }
    }

    for (
      const {
        encodedId,
        isMany,
        isInverse,
      } of attributes.values()
    ) {
      if (!isMany) {
        if (isInverse) {
          newUniqueInverseAttributeIndex.put(encodedId);
        } else {
          newUniqueAttributeIndex.put(encodedId);
        }
      }
    }

    this.ids = idDescription;
    this.attributes = attributes;
    this.forwardAttributeIndex = forwardAttributeIndex;
    this.inverseAttributeIndex = inverseAttributeIndex;
    this.uniqueAttributeIndex = newUniqueAttributeIndex.complete();
    this.uniqueInverseAttributeIndex = newUniqueInverseAttributeIndex
      .complete();
  }

  validator(middleware = (commit) => [commit]) {
    const self = this;
    return function* (commit) {
      for (
        const r of new Query(
          new IntersectionConstraint([
            indexConstraint(1, self.uniqueAttributeIndex),
            commit.commitKB.tribleset.patternConstraint([[0, 1, 2]]),
            commit.currentKB.tribleset.patternConstraint([[0, 1, 3]]),
          ]),
        )
      ) {
        if (!equalValue(r.get(2), r.get(3))) {
          throw Error(
            `constraint violation: multiple values for unique attribute`,
          );
        }
      }

      for (
        const r of new Query(
          new IntersectionConstraint([
            indexConstraint(1, self.uniqueInverseAttributeIndex),
            commit.commitKB.tribleset.patternConstraint([[2, 1, 0]]),
            commit.currentKB.tribleset.patternConstraint([[3, 1, 0]]),
          ]),
        )
      ) {
        if (!equalValue(r.get(2), r.get(3))) {
          throw Error(
            `constraint violation: multiple entities for unique attribute value`,
          );
        }
      }
      yield* middleware(commit);
    };
  }

  lookup(kb, eEncodedId, attributeName) {
    let {
      encodedId: aEncodedId,
      decoder,
      isLink,
      isInverse,
      isMany,
    } = this.attributes.get(attributeName);

    const res = new Query(
      new IntersectionConstraint([
        constantConstraint(0, eEncodedId),
        constantConstraint(1, aEncodedId),
        kb.tribleset.patternConstraint([isInverse ? [2, 1, 0] : [0, 1, 2]]),
      ]),
      (r) => r.get(2),
    );

    if (!isMany) {
      const { done, value } = res[Symbol.iterator]().next();
      if (done) return { found: false };
      return {
        found: true,
        result: isLink
          ? this.entityProxy(kb, decoder(value.slice()))
          : decoder(value.slice(), async () => await kb.blobcache.get(value)),
      };
    } else {
      const results = [];
      for (const value of res) {
        results.push(
          isLink
            ? this.entityProxy(kb, decoder(value.slice()))
            : decoder(value.slice(), async () => await kb.blobcache.get(value)),
        );
      }
      return {
        found: true,
        result: results,
      };
    }
  }

  entityProxy(kb, eId) {
    const eEncodedId = new Uint8Array(VALUE_SIZE);
    this.ids.encoder(eId, eEncodedId);

    const ns = this;

    return new Proxy(
      { [id]: eId },
      {
        get: function (o, attributeName) {
          if (!ns.attributes.has(attributeName)) {
            return undefined;
          }

          if (attributeName in o) {
            return o[attributeName];
          }

          const { found, result } = ns.lookup(kb, eEncodedId, attributeName);
          if (found) {
            Object.defineProperty(o, attributeName, {
              value: result,
              writable: false,
              configurable: false,
              enumerable: true,
            });
            return result;
          }
          return undefined;
        },
        set: function (_, _attributeName) {
          throw TypeError(
            "Error: Entities are not writable, please use 'with' on the walked KB.",
          );
        },
        has: function (o, attributeName) {
          if (!ns.attributes.has(attributeName)) {
            return false;
          }

          const {
            encodedId: aEncodedId,
            isInverse,
            isMany,
          } = ns.attributes.get(attributeName);
          if (
            attributeName in o || isMany
          ) {
            return true;
          }
          const { done } = new Query(
            new IntersectionConstraint([
              constantConstraint(0, eEncodedId),
              constantConstraint(1, aEncodedId),
              kb.tribleset.patternConstraint([
                isInverse ? [2, 1, 0] : [0, 1, 2],
              ]),
            ]),
          )[Symbol.iterator]().next();
          return !done;
        },
        deleteProperty: function (_, attr) {
          throw TypeError(
            "Error: Entities are not writable, furthermore KBs are append only.",
          );
        },
        setPrototypeOf: function (_) {
          throw TypeError(
            "Error: Entities are not writable and can only be POJOs.",
          );
        },
        isExtensible: function (_) {
          return true;
        },
        preventExtensions: function (_) {
          return false;
        },
        defineProperty: function (_, attr) {
          throw TypeError(
            "Error: Entities are not writable, please use 'with' on the walked KB.",
          );
        },
        getOwnPropertyDescriptor: function (o, attributeName) {
          if (!ns.attributes.has(attributeName)) {
            return undefined;
          }

          if (attributeName in o) {
            return Object.getOwnPropertyDescriptor(o, attributeName);
          }

          const { found, result } = ns.lookup(kb, eEncodedId, attributeName);
          if (found) {
            const property = {
              value: result,
              writable: false,
              configurable: false,
              enumerable: true,
            };
            Object.defineProperty(o, attributeName, property);
            return property;
          }
          return undefined;
        },
        ownKeys: function (_) {
          const attrs = [id];
          for (
            const r of new Query(
              new IntersectionConstraint([
                constantConstraint(0, eEncodedId),
                indexConstraint(1, ns.forwardAttributeIndex),
                new MaskedConstraint(
                  kb.tribleset.patternConstraint([[0, 1, 2]]),
                  [2],
                ),
              ]),
            )
          ) {
            const a = r.get(1);
            attrs.push(
              ...ns.forwardAttributeIndex.get(a).map((attr) => attr.name),
            );
          }

          for (
            const r of new Query(
              new IntersectionConstraint([
                constantConstraint(0, eEncodedId),
                indexConstraint(1, ns.inverseAttributeIndex),
                new MaskedConstraint(
                  kb.tribleset.patternConstraint([[2, 1, 0]]),
                  [2],
                ),
              ]),
            )
          ) {
            const a = r.get(1);
            attrs.push(
              ...ns.inverseAttributeIndex.get(a).map((attr) => attr.name),
            );
          }
          return attrs;
        },
      },
    );
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

  triplesToPattern(vars, triples) {
    const { encoder: idEncoder, decoder: idDecoder } = this.ids;
    const pattern = [];
    for (const [e, a, v] of triples) {
      const attributeDescription = this.attributes.get(a);
      let eVar;
      let aVar;
      let vVar;

      // Entity
      if (e instanceof Variable) {
        e.decoder ??= idDecoder;
        e.encoder ??= idEncoder;
        eVar = e;
      } else {
        const eb = new Uint8Array(VALUE_SIZE);
        idEncoder(e, eb);
        [eVar] = vars;
        eVar.constant(eb);
      }

      // Attribute
      [aVar] = vars;

      aVar.constant(attributeDescription.encodedId);

      // Value
      if (v instanceof Variable) {
        const { decoder, encoder } = attributeDescription;
        v.decoder ??= decoder;
        v.encoder ??= encoder;
        vVar = v;
      } else {
        const encoder = attributeDescription.encoder;
        const b = new Uint8Array(VALUE_SIZE);
        try {
          encoder(v, b);
        } catch (error) {
          throw Error(`Error encoding value: ${error.message}`);
        }
        [vVar] = vars;
        vVar.constant(b);
      }
      pattern.push([eVar, aVar, vVar]);
    }

    return pattern;
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

  pattern(source, vars, entities) {
    const triples = this.entitiesToTriples(
      vars,
      entities,
    );
    const pattern = this.triplesToPattern(vars, triples);
    return source.patternConstraint(pattern);
  }

  /**
   * Creates proxy object to walk the graph stored in the provided kb,
   * using this namespace for ids, attributes, and value encoding.
   * @param {Object} kb - The walked knowledge base.
   * @param {Object} eId - The id of the entity used as the root of the walk.
   * @returns {Proxy} - A proxy emulating the graph of the KB.
   */
  walk(kb, eId) {
    return this.entityProxy(kb, eId);
  }
}
