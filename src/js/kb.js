import { emptyValuePACT } from "./pact.js";
import {
  constantConstraint,
  indexConstraint,
  OrderByMinCostAndBlockage,
  resolve,
  variableBindings,
  branchState,
  dependencyState,
  rangeConstraint,
} from "./query.js";
import {
  A,
  E,
  equalValue,
  ID_SIZE,
  TRIBLE_SIZE,
  V,
  VALUE_SIZE,
} from "./trible.js";
import { ufoid } from "./types/ufoid.js";
import { TribleSet } from "./tribleset.js";
import { BlobCache } from "./blobcache.js";

const assert = (test, message) => {
  if (!test) {
    throw Error(message);
  }
};

const id = Symbol("id");

let invariantIndex = emptyValuePACT;
let uniqueAttributeIndex = emptyValuePACT;
let uniqueInverseAttributeIndex = emptyValuePACT;

function getInvariant(encodedId) {
  return invariantIndex.get(encodedId);
}

function globalInvariants(invariants) {
  let newInvariantIndex = invariantIndex;
  const newUniqueAttributeIndex = uniqueAttributeIndex.batch();
  const newUniqueInverseAttributeIndex = uniqueInverseAttributeIndex.batch();

  for (const {
    id: encodedId,
    isLink,
    isUnique,
    isUniqueInverse,
  } of invariants) {
    const existing = newInvariantIndex.get(encodedId);
    if (existing) {
      if (Boolean(existing.isLink) !== Boolean(isLink)) {
        throw Error(
          `Can't register inconsistent invariant"${encodedId}": isLink:${existing.isLink} !== isLink:${novel.isLink}`
        );
      }
      if (Boolean(existing.isUnique) !== Boolean(isUnique)) {
        throw Error(
          `Can't register inconsistent invariant"${encodedId}": isUnique:${existing.isUnique} !== isUnique:${novel.isUnique}`
        );
      }
      if (Boolean(existing.isUniqueInverse) !== Boolean(isUniqueInverse)) {
        throw Error(
          `Can't register inconsistent invariant "${encodedId}": isUniqueInverse:${existing.isUniqueInverse} !== isUniqueInverse:${novel.isUniqueInverse}`
        );
      }
    } else {
      if (isUniqueInverse && !isLink) {
        throw Error(
          `Can't register inconsistent invariant "${encodedId}": Only links can be inverse unique.`
        );
      }
      if (isUnique) {
        newUniqueAttributeIndex.put(encodedId);
      }
      if (isUniqueInverse) {
        newUniqueInverseAttributeIndex.put(encodedId);
      }
      newInvariantIndex = newInvariantIndex.put(encodedId, {
        isLink,
        isUnique,
        isUniqueInverse,
      });
    }
  }

  invariantIndex = newInvariantIndex;
  uniqueAttributeIndex = newUniqueAttributeIndex.complete();
  uniqueInverseAttributeIndex = newUniqueInverseAttributeIndex.complete();
}

class Variable {
  constructor(provider, index, name = null) {
    this.provider = provider;
    this.index = index;
    this.name = name;
    this.ascending = true;
    this.upperBound = undefined;
    this.lowerBound = undefined;
    this.isWalked = false;
    this.walkedKB = null;
    this.walkedNS = null;
    this.isOmit = false;
    this.paths = [];
    this.decoder = null;
    this.encoder = null;
    this.blobcache = null;
  }

  groupBy(otherVariable) {
    let potentialCycles = new Set([otherVariable.index]);
    while (potentialCycles.size !== 0) {
      if (potentialCycles.has(this)) {
        throw Error("Couldn't group variable, ordering would by cyclic.");
      }
      //TODO add omit sanity check.
      potentialCycles = new Set(
        this.provider.isBlocking
          .filter(([a, b]) => potentialCycles.has(b))
          .map(([a, b]) => a)
      );
    }
    this.provider.isBlocking.push([otherVariable.index, this.index]);
    return this;
  }

  ranged({ lower, upper }) {
    this.lowerBound = lower;
    this.upperBound = upper;
    return this;
  }
  // TODO: rework to 'ordered(o)' method that takes one of
  // ascending, descending, concentric
  // where concentric is relative to another variable that must be
  // bound before this variable
  ascend() {
    this.ascending = true;
    return this;
  }

  descend() {
    this.ascending = false;
    return this;
  }

  omit() {
    this.isOmit = true;
    this.provider.projected.delete(this.index);
    return this;
  }

  walk(kb, ns) {
    this.isWalked = true;
    this.walkedKB = kb;
    this.walkedNS = ns;
    return this;
  }

  toString() {
    if (this.name) {
      return `${this.name}@${this.index}`;
    }
    return `V:${this.index}`;
  }
  proposeBlobCache(blobcache) {
    // Todo check latency cost of blobcache, e.g. inMemory vs. S3.
    this.blobcache ||= blobcache;
    return this;
  }
}

class VariableProvider {
  constructor() {
    this.nextVariableIndex = 0;
    this.variables = [];
    this.unnamedVariables = [];
    this.namedVariables = new Map();
    this.constantVariables = emptyValuePACT;
    this.isBlocking = [];
    this.projected = new Set();
  }

  namedCache() {
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
      }
    );
  }

  unnamed() {
    const variable = new Variable(this, this.nextVariableIndex);
    this.unnamedVariables.push(variable);
    this.variables.push(variable);
    this.projected.add(this.nextVariableIndex);
    this.nextVariableIndex++;
    return variable;
  }

  constant(c) {
    let variable = this.constantVariables.get(c);
    if (!variable) {
      variable = new Variable(this, this.nextVariableIndex);
      variable.constant = c;
      this.constantVariables = this.constantVariables.put(c, variable);
      this.variables.push(variable);
      this.projected.add(this.nextVariableIndex);
      this.nextVariableIndex++;
    }
    return variable;
  }
}

const lookup = (ns, kb, eId, attributeName) => {
  let {
    isInverse,
    id: aId,
    decoder,
    isLink,
    isUnique,
    isUniqueInverse,
  } = ns.attributes.get(attributeName);

  const constraints = [
    constantConstraint(0, eId),
    constantConstraint(1, aId),
    kb.tribleset.constraint(...(isInverse ? [2, 1, 0] : [0, 1, 2])),
  ];
  const res = resolve(
    constraints,
    new OrderByMinCostAndBlockage(3, new Set([0, 1, 2])),
    new Set([0, 1, 2]),
    variableBindings(3),
    branchState(3),
    dependencyState(3, constraints),
    branchState(3)
  );

  if ((!isInverse && isUnique) || (isInverse && isUniqueInverse)) {
    const { done, value } = res.next();
    if (done) return { found: false };
    const v = value.slice(VALUE_SIZE * 2, VALUE_SIZE * 3);
    return {
      found: true,
      result: isLink
        ? entityProxy(ns, kb, v)
        : decoder(v.slice(), async () => await kb.blobcache.get(v)),
    };
  } else {
    const results = [];
    for (const r of res) {
      const v = r.slice(VALUE_SIZE * 2, VALUE_SIZE * 3);
      results.push(
        isLink
          ? entityProxy(ns, kb, v)
          : decoder(v.slice(), async () => await kb.blobcache.get(v))
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
          isUnique,
          isUniqueInverse,
        } = ns.attributes.get(attributeName);
        if (
          attributeName in o ||
          !isUnique ||
          (isInverse && !isUniqueInverse)
        ) {
          return true;
        }
        const constraints = [
          constantConstraint(0, eId),
          constantConstraint(1, aId),
          kb.tribleset.constraint(...(isInverse ? [2, 1, 0] : [0, 1, 2])),
        ];
        const { done } = resolve(
          constraints,
          new OrderByMinCostAndBlockage(3, new Set([0, 1])),
          new Set([0, 1, 2]),
          variableBindings(3),
          branchState(3),
          dependencyState(3, constraints),
          branchState(3)
        ).next();
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
        for (const r of resolve(
          forwardConstraints,
          new OrderByMinCostAndBlockage(3, new Set([0, 1])),
          new Set([0, 1, 2]),
          variableBindings(3),
          branchState(3),
          dependencyState(3, forwardConstraints),
          branchState(3)
        )) {
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
        for (const r of resolve(
          inverseConstraints,
          new OrderByMinCostAndBlockage(3, new Set([0, 1])),
          new Set([0, 1, 2]),
          variableBindings(3),
          branchState(3),
          dependencyState(3, inverseConstraints),
          branchState(3)
        )) {
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
    if (attributeDescription.expectsArray) {
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

function* entitiesToTriples(ns, unknownFactory, entities) {
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
  const { encoder: idEncoder, decoder: idDecoder } = ns.attributes.get(id);
  const precompiledTriples = [];
  for (const [e, a, v] of triples) {
    const attributeDescription = ns.attributes.get(a);
    let eVar;
    let aVar;
    let vVar;

    // Entity
    if (e instanceof Variable) {
      !e.decoder ||
        assert(
          e.decoder === idDecoder && e.encoder === idEncoder,
          `Variables use incompatible types.`
        );
      e.decoder = idDecoder;
      e.encoder = idEncoder;
      eVar = e;
    } else {
      eVar = vars.constant(e);
    }

    // Attribute
    aVar = vars.constant(attributeDescription.id);

    // Value
    if (v instanceof Variable) {
      const { decoder, encoder } = attributeDescription;
      !v.decoder ||
        assert(
          v.decoder === decoder && v.encoder === encoder,
          `Variables at positions use incompatible types.`
        );
      v.decoder = decoder;
      v.encoder = encoder;
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
class KB {
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
      encoder: idEncoder,
      decoder: idDecoder,
    } = ns.attributes.get(id);
    const entities = efn(new IDSequence(idFactory));
    const triples = entitiesToTriples(ns, idFactory, entities);
    let newBlobCache = this.blobcache;
    const tribles = triplesToTribles(ns, triples, (key, blob) => {
      newBlobCache = newBlobCache.put(key, blob);
    });
    const newTribleSet = this.tribleset.with(tribles);
    return new KB(newTribleSet, newBlobCache);
  }

  where(entities) {
    return (ns, vars) => {
      const triples = entitiesToTriples(ns, () => vars.unnamed(), entities);
      const triplesWithVars = precompileTriples(ns, vars, triples);
      return {
        isStatic: true,
        constraints: [
          ...triplesWithVars.map(([e, a, v]) => {
            v.proposeBlobCache(this.blobcache);
            return this.tribleset.constraint(e.index, a.index, v.index);
          }),
        ],
      };
    };
  }

  walk(ns, eId) {
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

function* find(ns, cfn) {
  const vars = new VariableProvider();
  const constraints = [];
  for (const constraintBuilder of cfn(vars.namedCache())) {
    const constraintGroup = constraintBuilder(ns, vars);
    if (!constraintGroup.isStatic) {
      throw Error(
        `Can only use static constraint groups in find. Use either subscribe, or a static value like box.get().`
      );
    }
    for (const constraint of constraintGroup.constraints) {
      constraints.push(constraint);
    }
  }

  for (const constantVariable of vars.constantVariables.values()) {
    constraints.push(
      constantConstraint(constantVariable.index, constantVariable.constant)
    );
  }

  for (const { upperBound, lowerBound, encoder, index } of vars.variables) {
    let encodedLower = undefined;
    let encodedUpper = undefined;

    if (lowerBound !== undefined) {
      encodedLower = new Uint8Array(VALUE_SIZE);
      encoder(lowerBound, encodedLower);
    }
    if (upperBound !== undefined) {
      encodedUpper = new Uint8Array(VALUE_SIZE);
      encoder(upperBound, encodedUpper);
    }

    if (encodedLower !== undefined || encodedUpper !== undefined) {
      constraints.push(rangeConstraint(index, encodedLower, encodedUpper));
    }
  }

  const namedVariables = [...vars.namedVariables.values()];

  //console.log(namedVariables.map((v) => [v.name, v.index]));
  //console.log(constraints.map((c) => c.toString()));

  for (const r of resolve(
    constraints,
    new OrderByMinCostAndBlockage(
      vars.variables.length,
      vars.projected,
      vars.isBlocking
    ),
    new Set(vars.variables.filter((v) => v.ascending).map((v) => v.index)),
    variableBindings(vars.variables.length),
    branchState(vars.variables.length),
    dependencyState(3, constraints),
    branchState(3)
  )) {
    const result = {};
    for (const {
      index,
      isWalked,
      walkedKB,
      walkedNS,
      decoder,
      name,
      isOmit,
      blobcache,
    } of namedVariables) {
      if (!isOmit) {
        const encoded = r.slice(index * VALUE_SIZE, (index + 1) * VALUE_SIZE);
        Object.defineProperty(result, name, {
          configurable: true,
          enumerable: true,
          get: function () {
            delete this[name];
            const decoded = decoder(
              encoded,
              // Note that there is a potential attack vector here, if we ever want to do query level access control.
              // An attacker could change the encoder to point to an change the encoded array to request a different blob.
              // This would be solved by freezing the Array, but since it's typed and the spec designers unimaginative...
              async () => await blobcache.get(encoded)
            );
            return (this[name] = isWalked
              ? walkedKB.walk(walkedNS || ns, decoded)
              : decoded);
          },
        });
      }
    }
    yield result;
  }
}

const namespace = (ns) => {
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
  attributes.set(id, idDescription);

  for (const [attributeName, attributeDescription] of Object.entries(ns)) {
    const invariant = invariantIndex.get(attributeDescription.id);
    if (!invariant) {
      throw Error(`Missing invariants for attribute "${attributeName}".`);
    }
    if (attributeDescription.isInverse && !invariant.isLink) {
      throw Error(
        `Error in namespace "${attributeName}": Only links can be inverse.`
      );
    }
    if (!attributeDescription.decoder && !invariant.isLink) {
      throw Error(
        `Missing decoder in namespace for attribute ${attributeName}.`
      );
    }
    if (!attributeDescription.encoder && !invariant.isLink) {
      throw Error(
        `Missing encoder in namespace for attribute ${attributeName}.`
      );
    }
    const description = {
      ...attributeDescription,
      ...invariant,
      expectsArray: Boolean(
        (!attributeDescription.isInverse && !invariant.isUnique) ||
          (attributeDescription.isInverse && !invariant.isUniqueInverse)
      ),
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

  return { attributes, forwardAttributeIndex, inverseAttributeIndex };
};

export {
  entitiesToTriples,
  find,
  getInvariant,
  globalInvariants,
  id,
  KB,
  namespace,
};
