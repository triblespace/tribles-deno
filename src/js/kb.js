import { emptyValuePACT } from "./pact.js";
import {
  constantConstraint,
  indexConstraint,
  IntersectionConstraint,
  MaskedConstraint,
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
import { FOTribleSet } from "./tribleset.js";
import { BlobCache } from "./blobcache.js";
import { id, buildNamespace } from "./namespace.js";

const assert = (test, message) => {
  if (!test) {
    throw Error(message);
  }
};

const lookup = (build_ns, kb, eId, attributeName) => {
  let {
    id: aId,
    decoder,
    isLink,
    isInverse,
    isMany,
  } = build_ns.attributes.get(attributeName);

  const res = new Query(
    new IntersectionConstraint([
      constantConstraint(0, eId),
      constantConstraint(1, aId),
      kb.tribleset.patternConstraint([(isInverse ? [2, 1, 0] : [0, 1, 2])]),
    ]),
    (r) => r.get(2)
  );

  if (!isMany) {
    const { done, value } = res[Symbol.iterator]().next();
    if (done) return { found: false };
    return {
      found: true,
      result: isLink
        ? entityProxy(build_ns, kb, value)
        : decoder(value.slice(), async () => await kb.blobcache.get(value)),
    };
  } else {
    const results = [];
    for (const value of res) {
      results.push(
        isLink
          ? entityProxy(build_ns, kb, value)
          : decoder(value.slice(), async () => await kb.blobcache.get(value))
      );
    }
    return {
      found: true,
      result: results,
    };
  }
};

const entityProxy = function entityProxy(build_ns, kb, eId) {
  return new Proxy(
    { [id]: eId },
    {
      get: function (o, attributeName) {
        if (!build_ns.attributes.has(attributeName)) {
          return undefined;
        }

        if (attributeName in o) {
          return o[attributeName];
        }

        const { found, result } = lookup(build_ns, kb, eId, attributeName);
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
        if (!build_ns.attributes.has(attributeName)) {
          return false;
        }

        const {
          id: aId,
          isInverse,
          isMany,
        } = build_ns.attributes.get(attributeName);
        if (
          attributeName in o || isMany
        ) {
          return true;
        }
        const { done } = new Query(
          new IntersectionConstraint([
            constantConstraint(0, eId),
            constantConstraint(1, aId),
            kb.tribleset.patternConstraint([(isInverse ? [2, 1, 0] : [0, 1, 2])]),
          ])
        )[Symbol.iterator]().next();
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
        if (!build_ns.attributes.has(attributeName)) {
          return undefined;
        }

        if (attributeName in o) {
          return Object.getOwnPropertyDescriptor(o, attributeName);
        }

        const { found, result } = lookup(build_ns, kb, eId, attributeName);
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
        for (const r of new Query(
          new IntersectionConstraint([
            constantConstraint(0, eId),
            indexConstraint(1, build_ns.forwardAttributeIndex),
            new MaskedConstraint(kb.tribleset.patternConstraint([[0, 1, 2]]), [2]),
          ]),
        )) {
          const a = r.get(1);
          attrs.push(
            ...build_ns.forwardAttributeIndex.get(a).map((attr) => attr.name)
          );
        }

        for (const r of new Query(
          new IntersectionConstraint([
            constantConstraint(0, eId),
            indexConstraint(1, build_ns.inverseAttributeIndex),
            new MaskedConstraint(kb.tribleset.patternConstraint([[2, 1, 0]]), [2]),
          ])
        )) {
          const a = r.get(1);
          attrs.push(
            ...build_ns.inverseAttributeIndex.get(a).map((attr) => attr.name)
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
  build_ns,
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
    const attributeDescription = build_ns.attributes.get(attributeName);
    assert(
      attributeDescription,
      `No attribute named '${attributeName}' in namespace.`
    );
    if (attributeDescription.isMulti) {
      for (const v of value) {
        if (attributeDescription.isLink && isPojo(v)) {
          yield* entityToTriples(
            build_ns,
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
          build_ns,
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

export function* entitiesToTriples(build_ns, unknownFactory, entities) {
  for (const entity of entities) {
    yield* entityToTriples(build_ns, unknownFactory, null, null, entity);
  }
}

function* triplesToTribles(build_ns, triples, blobFn = (trible, blob) => {}) {
  for (const [e, a, v] of triples) {
    const attributeDescription = build_ns.attributes.get(a);

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
      blobFn(trible, blob);
    }
    yield trible;
  }
}

const precompileTriples = (build_ns, vars, triples) => {
  const { encoder: idEncoder, decoder: idDecoder } = build_ns.ids;
  const precompiledTriples = [];
  for (const [e, a, v] of triples) {
    const attributeDescription = build_ns.attributes.get(a);
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
   * @param {FOTribleSet} tribleset - The tribles stored.
   * @param {BlobCache} blobcache - The blobs associated with the tribles.
   */
  constructor(tribleset = new FOTribleSet(), blobcache = new BlobCache()) {
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
    const build_ns = buildNamespace(ns);
    const {
      factory: idFactory,
    } = build_ns.ids;
    const entities = efn(new IDSequence(idFactory));
    const triples = entitiesToTriples(build_ns, idFactory, entities);
    let newBlobCache = this.blobcache;
    const tribles = triplesToTribles(build_ns, triples, (key, blob) => {
      newBlobCache = newBlobCache.put(key, blob);
    });
    const newTribleSet = this.tribleset.with(tribles);
    return new KB(newTribleSet, newBlobCache);
  }

  where(ns, entities) {
    const build_ns = buildNamespace(ns);
    return (vars) => {
      const triples = entitiesToTriples(build_ns, () => vars.unnamed(), entities);
      const triplesWithVars = precompileTriples(build_ns, vars, triples);
      for (const [_e, _a, v] of triplesWithVars) {
        v.proposeBlobCache(this.blobcache);
      }
      return this.tribleset.patternConstraint(triplesWithVars.map(([e, a, v]) => [e.index, a.index, v.index]));
    };
  }

  walk(ns, eId) {
    const build_ns = buildNamespace(ns);
    return entityProxy(build_ns, this, eId);
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
    const blobcache = this.blobcache.union(other.blobcache);
    return new KB(tribleset, blobcache);
  }

  subtract(other) {
    const tribleset = this.tribleset.subtract(other.tribleset);
    const blobcache = this.blobcache.subtract(other.blobcache);
    return new KB(tribleset, blobcache);
  }

  difference(other) {
    const tribleset = this.tribleset.difference(other.tribleset);
    const blobcache = this.blobcache.difference(other.blobcache);
    return new KB(tribleset, blobcache);
  }

  intersect(other) {
    const tribleset = this.tribleset.intersect(other.tribleset);
    const blobcache = this.blobcache.intersect(other.blobcache);
    return new KB(tribleset, blobcache);
  }
}
