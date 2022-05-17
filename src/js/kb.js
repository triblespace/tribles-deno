import { emptyValuePACT } from "./pact.js";
import {
  constantConstraint,
  indexConstraint,
  OrderByMinCostAndBlockage,
  Query,
  Variable,
} from "./query.js";
import {
  A,
  E,
  TRIBLE_SIZE,
  V,
  VALUE_SIZE,
} from "./trible.js";
import { TribleSet } from "./tribleset.js";
import { BlobCache } from "./blobcache.js";

const assert = (test, message) => {
  if (!test) {
    throw Error(message);
  }
};

export const id = Symbol("id");

const lookup = (ns, kb, eId, attributeName) => {
  let {
    id: aId,
    decoder,
    isLink,
    isInverse,
    isMany,
  } = ns.attributes.get(attributeName);

  const constraints = [
    constantConstraint(0, eId),
    constantConstraint(1, aId),
    kb.tribleset.constraint(...(isInverse ? [2, 1, 0] : [0, 1, 2])),
  ];
  const res = new Query(
    3,
    constraints,
    new OrderByMinCostAndBlockage(3, new Set([0, 1, 2])),
    new Set([0, 1, 2]),
    (r) => r.slice(VALUE_SIZE * 2, VALUE_SIZE * 3)
  ).run();

  if (!isMany) {
    const { done, value } = res.next();
    if (done) return { found: false };
    return {
      found: true,
      result: isLink
        ? entityProxy(ns, kb, value)
        : decoder(value.slice(), async () => await kb.blobcache.get(value)),
    };
  } else {
    const results = [];
    for (const value of res) {
      results.push(
        isLink
          ? entityProxy(ns, kb, value)
          : decoder(value.slice(), async () => await kb.blobcache.get(value))
      );
    }
    return {
      found: true,
      result: results,
    };
  }
};

const entityProxy = function entityProxy(ns, kb, eId) {
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

        const { found, result } = lookup(ns, kb, eId, attributeName);
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
          "Error: Entities are not writable, please use 'with' on the walked KB."
        );
      },
      has: function (o, attributeName) {
        if (!ns.attributes.has(attributeName)) {
          return false;
        }

        const {
          id: aId,
          isInverse,
          isMany,
        } = ns.attributes.get(attributeName);
        if (
          attributeName in o || isMany
        ) {
          return true;
        }
        const constraints = [
          constantConstraint(0, eId),
          constantConstraint(1, aId),
          kb.tribleset.constraint(...(isInverse ? [2, 1, 0] : [0, 1, 2])),
        ];
        const { done } = new Query(
          3,
          constraints,
          new OrderByMinCostAndBlockage(3, new Set([0, 1])),
          new Set([0, 1, 2])
        )
          .run()
          .next();
        return !done;
      },
      deleteProperty: function (_, attr) {
        throw TypeError(
          "Error: Entities are not writable, furthermore KBs are append only."
        );
      },
      setPrototypeOf: function (_) {
        throw TypeError(
          "Error: Entities are not writable and can only be POJOs."
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
          "Error: Entities are not writable, please use 'with' on the walked KB."
        );
      },
      getOwnPropertyDescriptor: function (o, attributeName) {
        if (!ns.attributes.has(attributeName)) {
          return undefined;
        }

        if (attributeName in o) {
          return Object.getOwnPropertyDescriptor(o, attributeName);
        }

        const { found, result } = lookup(ns, kb, eId, attributeName);
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
        const forwardConstraints = [
          constantConstraint(0, eId),
          indexConstraint(1, ns.forwardAttributeIndex),
          kb.tribleset.constraint(0, 1, 2),
        ];
        for (const r of new Query(
          3,
          forwardConstraints,
          new OrderByMinCostAndBlockage(3, new Set([0, 1])),
          new Set([0, 1, 2])
        ).run()) {
          const a = r.slice(VALUE_SIZE, VALUE_SIZE * 2);
          attrs.push(
            ...ns.forwardAttributeIndex.get(a).map((attr) => attr.name)
          );
        }

        const inverseConstraints = [
          constantConstraint(0, eId),
          kb.tribleset.constraint(2, 1, 0),
          indexConstraint(1, ns.inverseAttributeIndex),
        ];
        for (const r of new Query(
          3,
          inverseConstraints,
          new OrderByMinCostAndBlockage(3, new Set([0, 1])),
          new Set([0, 1, 2])
        ).run()) {
          const a = r.slice(VALUE_SIZE, VALUE_SIZE * 2);
          attrs.push(
            ...ns.inverseAttributeIndex.get(a).map((attr) => attr.name)
          );
        }
        return attrs;
      },
    }
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
  entity
) {
  const entityId = entity[id] || unknownFactory();
  if (parentId !== null) {
    yield [parentId, parentAttributeName, entityId];
  }
  for (const [attributeName, value] of Object.entries(entity)) {
    const attributeDescription = ns.attributes.get(attributeName);
    assert(
      attributeDescription,
      `No attribute named '${attributeName}' in namespace.`
    );
    if (attributeDescription.isMulti) {
      for (const v of value) {
        if (attributeDescription.isLink && isPojo(v)) {
          yield* entityToTriples(
            ns,
            unknownFactory,
            entityId,
            attributeName,
            v
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
          value
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

export function* entitiesToTriples(ns, unknownFactory, entities) {
  for (const entity of entities) {
    yield* entityToTriples(ns, unknownFactory, null, null, entity);
  }
}

function* triplesToTribles(ns, triples, blobFn = (key, blob) => {}) {
  for (const [e, a, v] of triples) {
    const attributeDescription = ns.attributes.get(a);

    const trible = new Uint8Array(TRIBLE_SIZE);
    E(trible).set(e.subarray(16, 32));
    A(trible).set(attributeDescription.id.subarray(16, 32));
    const encodedValue = V(trible);
    let blob;
    const encoder = attributeDescription.encoder;
    try {
      blob = encoder(v, encodedValue);
    } catch (err) {
      throw Error(
        `Couldn't encode '${v}' as value for attribute '${a}':\n${err}`
      );
    }

    if (blob) {
      blobFn(encodedValue, blob);
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
      eVar = vars.constant(e);
    }

    // Attribute
    aVar = vars.constant(attributeDescription.id);

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
   * @param {TribleSet} tribleset - The tribles stored.
   * @param {BlobCache} blobcache - The blobs associated with the tribles.
   */
  constructor(tribleset = new TribleSet(), blobcache = new BlobCache()) {
    this.tribleset = tribleset;
    this.blobcache = blobcache;
  }

  withTribles(tribles) {
    const tribleset = this.tribleset.with(tribles);
    if (tribleset === this.tribleset) {
      return this;
    }
    return new KB(tribleset, this.blobcache);
  }

  with(ns, efn) {
    const {
      factory: idFactory,
    } = ns.ids;
    const entities = efn(new IDSequence(idFactory));
    const triples = entitiesToTriples(ns, idFactory, entities);
    let newBlobCache = this.blobcache;
    const tribles = triplesToTribles(ns, triples, (key, blob) => {
      newBlobCache = newBlobCache.put(key, blob);
    });
    const newTribleSet = this.tribleset.with(tribles);
    return new KB(newTribleSet, newBlobCache);
  }

  where(ns, entities) {
    return (vars) => {
      const triples = entitiesToTriples(ns, () => vars.unnamed(), entities);
      const triplesWithVars = precompileTriples(ns, vars, triples);
      return [
        ...triplesWithVars.map(([e, a, v]) => {
          v.proposeBlobCache(this.blobcache);
          return this.tribleset.constraint(e.index, a.index, v.index);
        }),
      ];
    };
  }

  walk(ns, eId) {
    if (eId === undefined) return (curriedId) => this.walk(ns, curriedId);
    return entityProxy(ns, this, eId);
  }

  empty() {
    return new KB(this.tribleset.empty(), this.blobcache.empty());
  }

  isEmpty() {
    return this.tribleset.isEmpty();
  }

  isEqual(other) {
    return this.tribleset.isEqual(other.tribleset);
  }

  isSubsetOf(other) {
    return this.tribleset.isSubsetOf(other.tribleset);
  }

  isIntersecting(other) {
    return this.tribleset.isIntersecting(other.tribleset);
  }

  union(other) {
    const tribleset = this.tribleset.union(other.tribleset);
    const blobcache = this.blobcache.merge(other.blobcache);
    return new KB(tribleset, blobcache);
  }

  subtract(other) {
    const tribleset = this.tribleset.subtract(other.tribleset);
    const blobcache = this.blobcache.merge(other.blobcache).shrink(tribleset);
    return new KB(tribleset, blobcache);
  }

  difference(other) {
    const tribleset = this.tribleset.difference(other.tribleset);
    const blobcache = this.blobcache.merge(other.blobcache).shrink(tribleset);
    return new KB(tribleset, blobcache);
  }

  intersect(other) {
    const tribleset = this.tribleset.intersect(other.tribleset);
    const blobcache = this.blobcache.merge(other.blobcache).shrink(tribleset);
    return new KB(tribleset, blobcache);
  }
}

export function namespace(ns) {
  const attributes = new Map(); // attribute name -> attribute description
  let forwardAttributeIndex = emptyValuePACT; // non inverse attribute id -> [attribute description]
  let inverseAttributeIndex = emptyValuePACT; // inverse attribute id -> [attribute description],

  const idDescription = ns[id];
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

  for (const [attributeName, attributeDescription] of Object.entries(ns)) {
    if (attributeDescription.isInverse && !attributeDescription.isLink) {
      throw Error(
        `Bad options in namespace attribute ${attributeName}:
            Only links can be inversed.`
      );
    }
    if (!attributeDescription.isLink && !attributeDescription.decoder) {
      throw Error(
        `Missing decoder in namespace for attribute ${attributeName}.`
      );
    }
    if (!attributeDescription.isLink && !attributeDescription.encoder) {
      throw Error(
        `Missing encoder in namespace for attribute ${attributeName}.`
      );
    }
    const description = {
      ...attributeDescription,
      name: attributeName,
    };
    attributes.set(attributeName, description);
    if (description.isInverse) {
      inverseAttributeIndex = inverseAttributeIndex.put(description.id, [
        ...(inverseAttributeIndex.get(description.id) || []),
        description,
      ]);
    } else {
      forwardAttributeIndex = forwardAttributeIndex.put(description.id, [
        ...(forwardAttributeIndex.get(description.id) || []),
        description,
      ]);
    }
  }

  for (const [_, attributeDescription] of attributes) {
    if (attributeDescription.isLink) {
      attributeDescription.encoder = idDescription.encoder;
      attributeDescription.decoder = idDescription.decoder;
    }
  }

  return { ids: idDescription, attributes, forwardAttributeIndex, inverseAttributeIndex };
}
