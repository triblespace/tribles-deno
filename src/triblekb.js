import { emptyIdPACT, emptyValuePACT } from "./pact.js";
import {
  constantConstraint,
  indexConstraint,
  OrderByMinCostAndBlockage,
  resolve,
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

const assert = (test, message) => {
  if (!test) {
    throw Error(message);
  }
};

const id = Symbol("id");

let invariantIndex = emptyIdPACT;
let uniqueAttributeIndex = emptyIdPACT;
let uniqueInverseAttributeIndex = emptyIdPACT;

function getInvariant(attributeId) {
  const encodedId = new Uint8Array(16);
  ufoid.encoder(attributeId, encodedId);

  return invariantIndex.get(encodedId);
}

function globalInvariants(invariants) {
  let newInvariantIndex = invariantIndex;
  const newUniqueAttributeIndex = uniqueAttributeIndex.batch();
  const newUniqueInverseAttributeIndex = uniqueInverseAttributeIndex.batch();

  for (
    const [attributeId, { isLink, isUnique, isUniqueInverse }] of Object
      .entries(invariants)
  ) {
    const encodedId = new Uint8Array(16);
    ufoid.encoder(attributeId, encodedId);

    const existing = newInvariantIndex.get(encodedId);
    if (existing) {
      if (Boolean(existing.isLink) !== Boolean(isLink)) {
        throw Error(
          `Can't register inconsistent invariant"${attributeId}": isLink:${existing.isLink} !== isLink:${novel.isLink}`,
        );
      }
      if (Boolean(existing.isUnique) !== Boolean(isUnique)) {
        throw Error(
          `Can't register inconsistent invariant"${attributeId}": isUnique:${existing.isUnique} !== isUnique:${novel.isUnique}`,
        );
      }
      if (Boolean(existing.isUniqueInverse) !== Boolean(isUniqueInverse)) {
        throw Error(
          `Can't register inconsistent invariant "${attributeId}": isUniqueInverse:${existing.isUniqueInverse} !== isUniqueInverse:${novel.isUniqueInverse}`,
        );
      }
    } else {
      if (isUniqueInverse && !isLink) {
        throw Error(
          `Can't register inconsistent invariant "${attributeId}": Only links can be inverse unique.`,
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
    this.isWalked = false;
    this.walkedKB = null;
    this.walkedNS = null;
    this.isOmit = false;
    this.paths = [];
    this.decoder = null;
  }

  groupBy(otherVariable) {
    let potentialCycles = new Set([otherVariable.index]);
    while (potentialCycles.size !== 0) {
      if (potentialCycles.has(this)) {
        throw Error("Couldn't group variable, ordering would by cyclic.");
      }
      //TODO add omit sanity check.
      potentialCycles = new Set(
        this.provider.blockedBy
          .filter(([a, b]) => potentialCycles.has(a))
          .map(([a, b]) => b),
      );
    }
    this.provider.blockedBy.push([this.index, otherVariable.index]);
    return this;
  }

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
}

class VariableProvider {
  constructor() {
    this.nextVariableIndex = 0;
    this.variables = [];
    this.unnamedVariables = [];
    this.namedVariables = new Map();
    this.constantVariables = emptyValuePACT;
    this.blockedBy = [];
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
      },
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
    encodedId: aId,
    decoder,
    isLink,
    isUnique,
    isUniqueInverse,
  } = ns.attributes.get(attributeName);

  const res = resolve(
    [
      constantConstraint(0, eId),
      constantConstraint(1, aId),
      kb.tribledb.constraint(...(isInverse ? [2, 1, 0] : [0, 1, 2])),
    ],
    new OrderByMinCostAndBlockage(new Set([0, 1, 2])),
    new Set([0, 1, 2]),
    [
      new Uint8Array(VALUE_SIZE),
      new Uint8Array(VALUE_SIZE),
      new Uint8Array(VALUE_SIZE),
    ],
  );

  if ((!isInverse && isUnique) || (isInverse && isUniqueInverse)) {
    const { done, value } = res.next();
    if (done) return { found: false };
    const [_e, _a, v] = value;
    return {
      found: true,
      result: isLink
        ? entityProxy(ns, kb, v)
        : decoder(v.slice(0), async () => await kb.blobdb.get(v)),
    };
  } else {
    return {
      found: true,
      result: [...res].map(([_e, _a, v]) =>
        isLink
          ? entityProxy(ns, kb, v)
          : decoder(v.slice(0), async () => await kb.blobdb.get(v))
      ),
    };
  }
};

const entityProxy = function entityProxy(ns, kb, eId) {
  return new Proxy(
    { [id]: ns.attributes.get(id).decoder(eId) },
    {
      get: function (o, attributeName) {
        if (!(ns.attributes.has(attributeName))) {
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
          "Error: Entities are not writable, please use 'with' on the walked KB.",
        );
      },
      has: function (o, attributeName) {
        if (!(ns.attributes.has(attributeName))) {
          return false;
        }

        const { encodedId: aId, isInverse, isUnique, isUniqueInverse } = ns
          .attributes.get(attributeName);
        if (
          attributeName in o ||
          !isUnique ||
          (isInverse && !isUniqueInverse)
        ) {
          return true;
        }
        const { done } = resolve(
          [
            constantConstraint(0, eId),
            constantConstraint(1, aId),
            kb.tribledb.constraint(
              ...(isInverse ? [2, 1, 0] : [0, 1, 2]),
            ),
          ],
          new OrderByMinCostAndBlockage(new Set([0, 1])),
          new Set([0, 1, 2]),
          [
            new Uint8Array(VALUE_SIZE),
            new Uint8Array(VALUE_SIZE),
            new Uint8Array(VALUE_SIZE),
          ],
        ).next();
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
        if (!(ns.attributes.has(attributeName))) {
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
        for (
          const [_e, a, _v] of resolve(
            [
              constantConstraint(0, eId),
              indexConstraint(1, ns.forwardAttributeIndex),
              kb.tribledb.constraint(0, 1, 2),
            ],
            new OrderByMinCostAndBlockage(new Set([0, 1])),
            new Set([0, 1, 2]),
            [
              new Uint8Array(VALUE_SIZE),
              new Uint8Array(VALUE_SIZE),
              new Uint8Array(VALUE_SIZE),
            ],
          )
        ) {
          attrs.push(
            ...ns.forwardAttributeIndex.get(a.subarray(16)).map((attr) =>
              attr.name
            ),
          );
        }
        for (
          const [_e, a, _v] of resolve(
            [
              constantConstraint(0, eId),
              kb.tribledb.constraint(2, 1, 0),
              indexConstraint(1, ns.inverseAttributeIndex),
            ],
            new OrderByMinCostAndBlockage(new Set([0, 1])),
            new Set([0, 1, 2]),
            [
              new Uint8Array(VALUE_SIZE),
              new Uint8Array(VALUE_SIZE),
              new Uint8Array(VALUE_SIZE),
            ],
          )
        ) {
          attrs.push(
            ...ns.inverseAttributeIndex.get(a.subarray(16)).map((attr) =>
              attr.name
            ),
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

const entitiesToTriples = (ns, unknownFactory, root) => {
  const triples = [];
  const work = [];
  const rootIsArray = root instanceof Array;
  const rootIsObject = typeof root === "object" && root !== null;
  if (rootIsArray) {
    for (const [index, entity] of root.entries()) {
      work.push({ path: [index], value: entity });
    }
  } else if (rootIsObject) {
    work.push({ path: [], value: root });
  } else throw Error(`Root must be array of entities or entity, got:\n${root}`);

  while (work.length != 0) {
    const w = work.pop();
    if (
      (!w.parentId ||
        w.parentAttributeDescription.isLink) &&
      isPojo(w.value)
    ) {
      const entityId = w.value[id] || unknownFactory();
      if (w.parentId) {
        triples.push({
          path: w.path,
          triple: [w.parentId, w.parentAttributeDescription.name, entityId],
        });
      }
      for (const [attributeName, value] of Object.entries(w.value)) {
        assert(
          ns.attributes.get(attributeName),
          `Error at path [${w.path}]: No attribute named '${attributeName}' in namespace.`,
        );
        const attributeDescription = ns.attributes.get(
          attributeName,
        );
        if (
          attributeDescription.expectsArray
        ) {
          assert(
            value instanceof Array,
            `Error at path [${w.path}]: Expected array but found: ${value}`,
          );
          for (const [i, v] of value.entries()) {
            work.push({
              path: [...w.path, attributeName, i],
              value: v,
              parentId: entityId,
              parentAttributeDescription: attributeDescription,
            });
          }
        } else {
          work.push({
            path: [...w.path, attributeName],
            value,
            parentId: entityId,
            parentAttributeDescription: attributeDescription,
          });
        }
      }
    } else {
      triples.push({
        path: w.path,
        triple: [w.parentId, w.parentAttributeDescription.name, w.value],
      });
    }
  }
  return triples;
};

const triplesToTribles = function (ns, triples, tribles = [], blobs = []) {
  const idEncoder = ns.attributes.get(id).encoder;
  for (
    const {
      path,
      triple: [e, attributeName, v],
    } of triples
  ) {
    const attributeDescription = ns.attributes.get(attributeName);
    let entityId, value;
    if (!attributeDescription.isInverse) {
      entityId = e;
      value = v;
    } else {
      entityId = v;
      value = e;
    }
    const trible = new Uint8Array(TRIBLE_SIZE);
    const encodedValue = V(trible);
    let blob;
    const encoder = attributeDescription.encoder;
    try {
      blob = encoder(value, encodedValue);
    } catch (err) {
      throw Error(
        `Error at path [${path}]:Couldn't encode '${value}' as value for attribute '${attributeName}':\n${err}`,
      );
    }
    try {
      idEncoder(entityId, E(trible));
    } catch (err) {
      throw Error(
        `Error at path[${path}]:Couldn't encode '${entityId}' as entity id:\n${err}`,
      );
    }
    A(trible).set(attributeDescription.encodedId);

    tribles.push(trible);
    if (blob) {
      blobs.push([encodedValue, blob]);
    }
  }
  return { tribles, blobs };
};

const precompileTriples = (ns, vars, triples) => {
  const { encoder: idEncoder, decoder: idDecoder } = ns.attributes.get(id);
  const precompiledTriples = [];
  for (
    const {
      path,
      triple: [e, attributeName, v],
    } of triples
  ) {
    const attributeDescription = ns.attributes.get(attributeName);
    let entity, value;
    if (!attributeDescription.isInverse) {
      entity = e;
      value = v;
    } else {
      entity = v;
      value = e;
    }
    let entityVar;
    let attrVar;
    let valueVar;

    // Entity
    if (entity instanceof Variable) {
      entity.paths.push(path.slice(0, -1));
      !entity.decoder || assert(
        entity.decoder === idDecoder,
        `Error at paths ${entity.paths} and [${
          path.slice(
            0,
            -1,
          )
        }]:\n Variables at positions use incompatible decoders '${entity.decoder.name}' and '${idDecoder.name}'.`,
      );
      entity.decoder = idDecoder;
      entityVar = entity;
    } else {
      const b = new Uint8Array(VALUE_SIZE);
      try {
        idEncoder(entity, b);
      } catch (error) {
        throw Error(
          `Error encoding entity at [${path.slice(0, -1)}]: ${error.message}`,
        );
      }
      entityVar = vars.constant(b);
    }

    // Attribute
    const b = new Uint8Array(VALUE_SIZE);
    b.set(attributeDescription.encodedId, 16);
    attrVar = vars.constant(b);

    // Value
    if (value instanceof Variable) {
      value.paths.push([...path]);
      const decoder = attributeDescription.decoder;
      !value.decoder || assert(
        value.decoder === decoder,
        `Error at paths ${value.paths} and [${path}]:\n Variables at positions use incompatible decoders '${value.decoder.name}' and '${decoder.name}'.`,
      );
      value.decoder = decoder;
      valueVar = value;
    } else {
      const encoder = attributeDescription.encoder;
      const b = new Uint8Array(VALUE_SIZE);
      try {
        encoder(value, b);
      } catch (error) {
        throw Error(`Error encoding value at [${path}]: ${error.message}`);
      }
      valueVar = vars.constant(b);
    }
    precompiledTriples.push([entityVar, attrVar, valueVar]);
  }

  return precompiledTriples;
};

function* find(ns, cfn, blobdb) {
  const vars = new VariableProvider();
  const constraintBuilderPrepares = cfn(vars.namedCache());
  const constraintBuilders = constraintBuilderPrepares.map((prepare) =>
    prepare(ns, vars)
  );

  const namedVariables = [...vars.namedVariables.values()];

  const constraints = constraintBuilders.flatMap((builder) => builder());
  constraints.push(
    ...[...vars.constantVariables.values()].map((v) =>
      constantConstraint(v.index, v.constant)
    ),
  );

  for (
    const r of resolve(
      constraints,
      new OrderByMinCostAndBlockage(vars.projected, vars.blockedBy),
      new Set(vars.variables.filter((v) => v.ascending).map((v) => v.index)),
      vars.variables.map((_) => new Uint8Array(VALUE_SIZE)),
    )
  ) {
    const result = {};
    for (
      const {
        index,
        isWalked,
        walkedKB,
        walkedNS,
        decoder,
        name,
        isOmit,
      } of namedVariables
    ) {
      if (!isOmit) {
        const encoded = r[index];
        const decoded = decoder(
          encoded.slice(0),
          async () => await blobdb.get(encoded),
        );
        result[name] = isWalked
          ? walkedKB.walk(walkedNS || ns, decoded)
          : decoded;
      }
    }
    yield result;
  }
}

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

class TribleKB {
  constructor(tribledb, blobdb) {
    this.tribledb = tribledb;
    this.blobdb = blobdb;
  }

  withTribles(tribles) {
    const tribledb = this.tribledb.with(tribles);
    if (tribledb === this.tribledb) {
      return this;
    }
    return new TribleKB(tribledb, this.blobdb);
  }

  with(ns, efn) {
    const { factory: idFactory, encoder: idEncoder, decoder: idDecoder } = ns
      .attributes.get(id);
    const entities = efn(new IDSequence(idFactory));
    const triples = entitiesToTriples(ns, idFactory, entities);
    const { tribles, blobs } = triplesToTribles(ns, triples);
    const newTribleDB = this.tribledb.with(tribles);
    if (newTribleDB !== this.tribledb) {
      let touchedEntities = emptyIdPACT.batch();
      for (const trible of tribles) {
        touchedEntities.put(E(trible));
      }
      touchedEntities = touchedEntities.complete();
      let touchedAttributes = emptyIdPACT.batch();
      for (const trible of tribles) {
        touchedAttributes.put(A(trible));
      }
      touchedAttributes = touchedAttributes.complete();
      let touchedValues = emptyValuePACT.batch();
      for (const trible of tribles) {
        touchedValues.put(V(trible));
      }
      touchedValues = touchedValues.complete();

      let prevE = null;
      let prevA = null;
      for (
        const [e, a] of resolve(
          [
            indexConstraint(0, touchedEntities),
            indexConstraint(1, touchedAttributes),
            indexConstraint(1, uniqueAttributeIndex),
            newTribleDB.constraint(0, 1, 2),
          ],
          new OrderByMinCostAndBlockage(new Set([0, 1, 2]), [
            [2, 0],
            [2, 1],
          ]),
          new Set([0, 1, 2]),
          [
            new Uint8Array(VALUE_SIZE),
            new Uint8Array(VALUE_SIZE),
            new Uint8Array(VALUE_SIZE),
          ],
        )
      ) {
        if (
          prevE !== null &&
          prevA !== null &&
          equalValue(prevE, e) &&
          equalValue(prevA, a)
        ) {
          throw Error(
            `Constraint violation: Unique attribute '${
              ufoid.decoder(
                a,
                () => undefined,
              )
            }' has multiple values on '${idDecoder(e, () => undefined)}'.`,
          );
        }
        prevE = e.slice();
        prevA = a.slice();
      }

      prevA = null;
      let prevV = null;
      for (
        const [e, a, v] of resolve(
          [
            indexConstraint(2, touchedValues),
            indexConstraint(1, touchedAttributes),
            indexConstraint(1, uniqueInverseAttributeIndex),
            newTribleDB.constraint(0, 1, 2),
          ],
          new OrderByMinCostAndBlockage(new Set([0, 1, 2]), [
            [0, 1],
            [0, 2],
          ]),
          new Set([0, 1, 2]),
          [
            new Uint8Array(VALUE_SIZE),
            new Uint8Array(VALUE_SIZE),
            new Uint8Array(VALUE_SIZE),
          ],
        )
      ) {
        if (
          prevA !== null &&
          prevV !== null &&
          equalValue(prevA, a) &&
          equalValue(prevV, v)
        ) {
          //TODO make errors pretty.
          throw Error(
            `Constraint violation: Unique inverse attribute '${
              ufoid.decoder(
                a,
                () => undefined,
              )
            }' has multiple entities for '${v}'.`,
          );
        }
        prevA = a.slice();
        prevV = v.slice();
      }

      const newBlobDB = this.blobdb.put(blobs);
      return new TribleKB(newTribleDB, newBlobDB);
    }
    return this;
  }

  find(ns, efn) {
    return find(ns, (vars) => [this.where(efn(vars))], this.blobdb);
  }

  where(entities) {
    return (ns, vars) => {
      const triples = entitiesToTriples(ns, () => vars.unnamed(), entities);
      const triplesWithVars = precompileTriples(ns, vars, triples);
      return () => [
        ...triplesWithVars.map(([{ index: e }, { index: a }, { index: v }]) =>
          this.tribledb.constraint(e, a, v)
        ),
      ];
    };
  }

  walk(ns, entityId) {
    const eId = new Uint8Array(ID_SIZE);
    ns.attributes.get(id).encoder(entityId, eId);
    return entityProxy(ns, this, eId);
  }

  empty() {
    return new TribleKB(this.tribledb.empty(), this.blobdb.empty());
  }

  isEmpty() {
    return this.tribledb.isEmpty();
  }

  isEqual(other) {
    return (
      //TODO Should we also compare constraints here?
      this.tribledb.isEqual(other.tribledb) && this.blobdb.isEqual(other.blobdb)
    );
  }

  isSubsetOf(other) {
    return this.tribledb.isSubsetOf(other.tribledb);
  }

  isIntersecting(other) {
    return this.tribledb.isIntersecting(other.tribledb);
  }

  //TODO check invariantIndex!
  union(other) {
    const tribledb = this.tribledb.union(other.tribledb);
    const blobdb = this.blobdb.merge(other.blobdb);
    return new TribleKB(tribledb, blobdb);
  }

  subtract(other) {
    const tribledb = this.tribledb.subtract(other.tribledb);
    const blobdb = this.blobdb.merge(other.blobdb).shrink(tribledb);
    return new TribleKB(tribledb, blobdb);
  }

  difference(other) {
    const tribledb = this.tribledb.difference(other.tribledb);
    const blobdb = this.blobdb.merge(other.blobdb).shrink(tribledb);
    return new TribleKB(tribledb, blobdb);
  }

  intersect(other) {
    const tribledb = this.tribledb.intersect(other.tribledb);
    const blobdb = this.blobdb.merge(other.blobdb).shrink(tribledb);
    return new TribleKB(tribledb, blobdb);
  }
}

const namespace = (...namespaces) => {
  const attributes = new Map(); // attribute name -> attribute description
  let forwardAttributeIndex = emptyIdPACT; // non inverse attribute id -> [attribute description]
  let inverseAttributeIndex = emptyIdPACT; // inverse attribute id -> [attribute description],

  for (const namespace of namespaces) {
    if (namespace[id]) {
      if (attributes.has(id)) {
        if (
          namespace[id].encoder !== attributes.get(id).encoder ||
          namespace[id].decoder !== attributes.get(id).decoder ||
          namespace[id].factory !== attributes.get(id).factory
        ) {
          throw Error(`Inconsistent id types in namespace.`);
        }
      } else {
        attributes.set(id, namespace[id]);
      }
    }

    for (
      const [attributeName, attributeDescription] of Object.entries(namespace)
    ) {
      const existingAttributeDescription = attributes.get(attributeName);
      if (existingAttributeDescription) {
        if (existingAttributeDescription.id !== attributeDescription.id) {
          throw Error(
            `Inconsistent attribute "${attributeName}": id:${existingAttributeDescription.id} !== id:${attributeDescription.id}`,
          );
        }
        if (
          Boolean(existingAttributeDescription.isInverse) !==
            Boolean(attributeDescription.isInverse)
        ) {
          throw Error(
            `Inconsistent attribute "${attributeName}": isInverse:${existingAttributeDescription.isInverse} !== isInverse:${attributeDescription.isInverse}`,
          );
        }
        if (
          existingAttributeDescription.decoder !== attributeDescription.decoder
        ) {
          throw Error(
            `Inconsistent attribute "${attributeName}": decoder:${existingAttributeDescription.decoder} !== decoder:${attributeDescription.decoder}`,
          );
        }
        if (
          existingAttributeDescription.encoder !== attributeDescription.encoder
        ) {
          throw Error(
            `Inconsistent attribute "${attributeName}": encoder:${existingAttributeDescription.decoder} !== encoder:${attributeDescription.decoder}`,
          );
        }
      } else {
        const encodedId = new Uint8Array(ID_SIZE);
        ufoid.encoder(attributeDescription.id, encodedId);
        const invariant = invariantIndex.get(encodedId);
        if (!invariant) {
          throw Error(`Missing invariants for attribute ${attributeName}.`);
        }
        if (
          attributeDescription.isInverse &&
          !invariant.isLink
        ) {
          throw Error(
            `Error in namespace "${attributeName}": Only links can be inverse.`,
          );
        }
        if (
          !attributeDescription.decoder && !invariant.isLink
        ) {
          throw Error(
            `Missing decoder in namespace for attribute ${attributeName}.`,
          );
        }
        if (
          !attributeDescription.encoder && !invariant.isLink
        ) {
          throw Error(
            `Missing encoder in namespace for attribute ${attributeName}.`,
          );
        }
        const description = {
          ...attributeDescription,
          ...invariant,
          expectsArray: Boolean(
            (!attributeDescription.isInverse && !invariant.isUnique) ||
              (attributeDescription.isInverse && !invariant.isUniqueInverse),
          ),
          encodedId,
          name: attributeName,
        };
        attributes.set(attributeName, description);
        if (description.isInverse) {
          inverseAttributeIndex = inverseAttributeIndex.put(encodedId, [
            ...(inverseAttributeIndex.get(encodedId) || []),
            description,
          ]);
        } else {
          forwardAttributeIndex = forwardAttributeIndex.put(encodedId, [
            ...(forwardAttributeIndex.get(encodedId) || []),
            description,
          ]);
        }
      }
    }
  }
  const idAttributeDescription = attributes.get(id);
  if (!idAttributeDescription) {
    throw Error(`Incomplete namespace: Missing [id] field.`);
  }
  if (!idAttributeDescription.decoder) {
    throw Error(`Incomplete namespace: Missing [id] decoder.`);
  }
  if (!idAttributeDescription.encoder) {
    throw Error(`Incomplete namespace: Missing [id] encoder.`);
  }
  if (!idAttributeDescription.factory) {
    throw Error(`Incomplete namespace: Missing [id] factory.`);
  }

  for (const [_, attributeDescription] of attributes) {
    if (attributeDescription.isLink) {
      attributeDescription.encoder = idAttributeDescription.encoder;
      attributeDescription.decoder = idAttributeDescription.decoder;
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
  namespace,
  TribleKB,
};
