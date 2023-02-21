import {
  constantConstraint,
  indexConstraint,
  IntersectionConstraint,
  MaskedConstraint,
  Query,
  Variable,
} from "./query.js";
import { A, E, TRIBLE_SIZE, V, VALUE_SIZE } from "./trible.js";
import { FOTribleSet } from "./tribleset.js";
import { BlobCache } from "./blobcache.js";
import { id } from "./namespace.js";

const assert = (test, message) => {
  if (!test) {
    throw Error(message);
  }
};

const lookup = (ns, kb, eEncodedId, attributeName) => {
  let {
    encodedId: aEncodedId,
    decoder,
    isLink,
    isInverse,
    isMany,
  } = ns.attributes.get(attributeName);

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
        ? entityProxy(ns, kb, decoder(value.slice()))
        : decoder(value.slice(), async () => await kb.blobcache.get(value)),
    };
  } else {
    const results = [];
    for (const value of res) {
      results.push(
        isLink
          ? entityProxy(ns, kb, decoder(value.slice()))
          : decoder(value.slice(), async () => await kb.blobcache.get(value)),
      );
    }
    return {
      found: true,
      result: results,
    };
  }
};

const entityProxy = function entityProxy(ns, kb, eId) {
  const eEncodedId = new Uint8Array(VALUE_SIZE);
  ns.ids.encoder(eId, eEncodedId);

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

        const { found, result } = lookup(ns, kb, eEncodedId, attributeName);
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
            kb.tribleset.patternConstraint([isInverse ? [2, 1, 0] : [0, 1, 2]]),
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

        const { found, result } = lookup(ns, kb, eEncodedId, attributeName);
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
};

const isPojo = (obj) => {
  if (obj === null || typeof obj !== "object") {
    return false;
  }
  return Object.getPrototypeOf(obj) === Object.prototype;
};

function* entityToTriples(
  ns,
  unknownFactory,
  parentId,
  parentAttributeName,
  entity,
) {
  const entityId = entity[id] || unknownFactory();
  if (parentId !== null) {
    yield [parentId, parentAttributeName, entityId];
  }
  for (const [attributeName, value] of Object.entries(entity)) {
    const attributeDescription = ns.attributes.get(attributeName);
    assert(
      attributeDescription,
      `No attribute named '${attributeName}' in namespace.`,
    );
    if (attributeDescription.isMany) {
      for (const v of value) {
        if (attributeDescription.isLink && isPojo(v)) {
          yield* entityToTriples(
            ns,
            unknownFactory,
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
        yield* entityToTriples(
          ns,
          unknownFactory,
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

export function* entitiesToTriples(build_ns, unknownFactory, entities) {
  for (const entity of entities) {
    yield* entityToTriples(build_ns, unknownFactory, null, null, entity);
  }
}

function* triplesToTribles(ns, triples, blobFn = (trible, blob) => {}) {
  const { encoder: idEncoder } = ns.ids;
  for (const [e, a, v] of triples) {
    const attributeDescription = ns.attributes.get(a);

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

    if (blob) {
      blobFn(trible, blob);
    }
    yield trible;
  }
}

const precompileTriples = (ns, vars, triples) => {
  const { encoder: idEncoder, decoder: idDecoder } = ns.ids;
  const precompiledTriples = [];
  for (const [e, a, v] of triples) {
    const attributeDescription = ns.attributes.get(a);
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
      eVar = vars.constant(eb);
    }

    // Attribute
    aVar = vars.constant(attributeDescription.encodedId);

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
      vVar = vars.constant(b);
    }
    precompiledTriples.push([eVar, aVar, vVar]);
  }

  return precompiledTriples;
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

/** A persistent immutable knowledge base that stores tribles and blobs,
    providing a (JSON) tree based interface to access and create the graph within.*/
export class KB {
  /**
   * Create a knowledge base with the gives tribles and blobs.
   * @param {FOTribleSet} tribleset - The tribles stored.
   * @param {BlobCache} blobcache - The blobs associated with the tribles.
   */
  constructor(tribleset = new FOTribleSet(), blobcache = new BlobCache()) {
    this.tribleset = tribleset;
    this.blobcache = blobcache;
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
   * Stores entities in the immutable KB, returning a new one while preserving the old one.
   * @param {Object} ctx - The context used for ids, attributes, and value encoding.
   * @param {entityFunction | entityGenerator} entities - A function/generator returning/yielding entities.
   * @returns {KB} A new KB with the entities added to it.
   */
  with(ns, entities) {
    const idFactory = ns.ids.factory;
    const createdEntities = entities(new IDSequence(idFactory));
    const triples = entitiesToTriples(
      ns,
      idFactory,
      createdEntities,
    );
    let newBlobCache = this.blobcache;
    const tribles = triplesToTribles(ns, triples, (key, blob) => {
      newBlobCache = newBlobCache.put(key, blob);
    });
    const newTribleSet = this.tribleset.with(tribles);
    return new KB(newTribleSet, newBlobCache);
  }

  /**
   * Stores tribles in the immutable KB, returning a new one while preserving the old one.
   * @param {Array} tribles - A function/generator returning/yielding entities.
   * @returns {KB} A new KB with the entities added to it.
   */
  withTribles(tribles) {
    const tribleset = this.tribleset.with(tribles);
    if (tribleset === this.tribleset) {
      return this;
    }
    return new KB(tribleset, this.blobcache);
  }

  /**
   * Creates a query constrained over the contents of this KB.
   * @param {Object} ctx - The context used for ids, attributes, and value encoding.
   * @param {Array} entities - A function/generator returning/yielding a pattern of entities to be matched.
   * @returns {Constraint} - A constraint that can be used in a `find` call.
   */
  where(ns, entities) {
    return (vars) => {
      const triples = entitiesToTriples(
        ns,
        () => vars.unnamed(),
        entities,
      );
      const triplesWithVars = precompileTriples(ns, vars, triples);
      for (const [_e, _a, v] of triplesWithVars) {
        v.proposeBlobCache(this.blobcache);
      }
      return this.tribleset.patternConstraint(
        triplesWithVars.map(([e, a, v]) => [e.index, a.index, v.index]),
      );
    };
  }

  /**
   * Creates proxy object to walk the graph stored in this KB.
   * @param {Object} ctx - The context used for ids, attributes, and value encoding.
   * @returns {Proxy} - A proxy emulating the graph of the KB.
   */
  walk(ns, eId) {
    return entityProxy(ns, this, eId);
  }

  /**
   * Returns an empty KB with the same type of tribleset and blobcache as this KB.
   * @returns {KB} - An empty KB.
   */
  empty() {
    return new KB(this.tribleset.empty(), this.blobcache.empty());
  }

  /**
   * Checks if this KB is empty (doesn't contain any tribles).
   * @returns {boolean}
   */
  isEmpty() {
    return this.tribleset.isEmpty();
  }

  /**
   * Checks if this KB contains the same tribles as the other KB.
   * @returns {boolean}
   */
  isEqual(other) {
    return this.tribleset.isEqual(other.tribleset);
  }

  /**
   * Checks if the tribles of KB are a subset of the tribles in the other KB.
   * @returns {boolean}
   */
  isSubsetOf(other) {
    return this.tribleset.isSubsetOf(other.tribleset);
  }

  /**
   * Checks if some trible exists in both in this KB and the other KB.
   * @returns {boolean}
   */
  isIntersecting(other) {
    return this.tribleset.isIntersecting(other.tribleset);
  }

  /**
   * Returns a new KB containing everything in this KB and the other KB.
   * @returns {KB}
   */
  union(other) {
    const tribleset = this.tribleset.union(other.tribleset);
    const blobcache = this.blobcache.union(other.blobcache);
    return new KB(tribleset, blobcache);
  }

  /**
   * Returns a new KB containing only things from this KB that were not in the other KB.
   * @returns {KB}
   */
  subtract(other) {
    const tribleset = this.tribleset.subtract(other.tribleset);
    const blobcache = this.blobcache.subtract(other.blobcache);
    return new KB(tribleset, blobcache);
  }

  /**
   * Returns a new KB containing only things not common to this KB and the other KB.
   * @returns {KB}
   */
  difference(other) {
    const tribleset = this.tribleset.difference(other.tribleset);
    const blobcache = this.blobcache.difference(other.blobcache);
    return new KB(tribleset, blobcache);
  }

  /**
   * Returns a new KB containing only things common to this KB and the other KB.
   * @returns {KB}
   */
  intersect(other) {
    const tribleset = this.tribleset.intersect(other.tribleset);
    const blobcache = this.blobcache.intersect(other.blobcache);
    return new KB(tribleset, blobcache);
  }
}
