const uuid = require("uuid");

const { emptyValuePART } = require("./part.js");
const {
  CollectionConstraint,
  ConstantConstraint,
  IndexConstraint,
  TripleConstraint,
  unsafeQuery,
} = require("./query.js");
const { A, E, TRIBLE_SIZE, V, VALUE_SIZE } = require("./trible.js");

const id = Symbol("id");

class Variable {
  constructor(provider, name = null) {
    this.provider = provider;
    this.name = name;
    this.index = null;
    this.ascending = true;
    this.walked = null;
    this.paths = [];
    this.decoder = null;
  }

  at(index) {
    this.index = index;
    if (
      this.provider.variables[index] &&
      this.provider.variables[index] !== this
    ) {
      throw Error(
        `Same variable position occupied by ${this} and ${
          this.provider.variables[index]
        }`,
      );
    }

    this.provider.variables[index] = this;

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

  walk(kb) {
    this.walked = kb;
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
    this.variables = [];
    this.unnamedVariables = [];
    this.namedVariables = new Map();
    this.constantVariables = emptyValuePART;
  }

  named() {
    return new Proxy({}, {
      get: (_, name) => {
        let v = this.namedVariables.get(name);
        if (v) {
          return v;
        }
        v = new Variable(this, name);
        this.namedVariables.set(name, v);
        return v;
      },
    });
  }

  unnamed() {
    return {
      next: () => {
        const variable = new Variable(this);
        this.unnamedVariables.push(variable);
        return { value: variable };
      },
    };
  }

  constant(c) {
    let v;
    this.constantVariables = this.constantVariables.put(c, (old) => {
      if (old) {
        v = old;
      } else {
        v = new Variable(this);
        v.constant = c;
      }
      return v;
    });
    return v;
  }

  arrange() {
    let vProbe = 0;
    for (
      const v of [
        ...this.constantVariables.values(),
        ...this.unnamedVariables,
        ...this.namedVariables.values(),
      ]
    ) {
      if (v.index === null) {
        while (this.variables[vProbe]) {
          vProbe++;
        }
        v.index = vProbe;
        this.variables[vProbe] = v;
      }
    }
  }
}

class IDSequence {
  constructor() {}

  [Symbol.iterator]() {
    return this;
  }
  next() {
    return { value: uuid.v4() };
  }
}

const entityProxy = function entityProxy(kb, ctx, entityId) {
  const attrsBatch = emptyValuePART.batch();
  const inverseAttrsBatch = emptyValuePART.batch();
  for (const [attr, { id: attrId, isInverseLink }] of Object.entries(ctx)) {
    const aId = new Uint8Array(VALUE_SIZE);
    ctx[id].encoder(attrId, aId);
    if (isInverseLink) {
      inverseAttrsBatch.put(aId, (attrs = []) => [...attrs, attr]);
    } else {
      attrsBatch.put(aId, (attrs = []) => [...attrs, attr]);
    }
  }
  const attrsById = attrsBatch.complete();
  const inverseAttrsById = inverseAttrsBatch.complete();

  const eId = new Uint8Array(VALUE_SIZE);
  ctx[id].encoder(entityId, eId);

  const lookup = (o, attr) => {
    const aId = new Uint8Array(VALUE_SIZE);
    ctx[id].encoder(ctx[attr].id, aId);
    if (ctx[attr].isInverseLink) {
      const res = unsafeQuery(
        [
          new ConstantConstraint(0, eId),
          new ConstantConstraint(1, aId),
          new TripleConstraint(kb.tribledb, [2, 1, 0]),
        ],
        3,
      );
      const decoder = ctx[id].decoder;
      const result = [...res].map(([_e, _a, v]) =>
        entityProxy(
          kb,
          ctx,
          decoder(v.slice(0), async () => await kb.blobdb.get(v)),
        )
      );

      return { found: true, result };
    } else {
      const res = unsafeQuery(
        [
          new ConstantConstraint(0, eId),
          new ConstantConstraint(1, aId),
          new TripleConstraint(kb.tribledb, [0, 1, 2]),
        ],
        3,
      );
      let result;
      let decoder;
      if (ctx[attr].isLink) {
        decoder = (v, b) => entityProxy(kb, ctx, ctx[id].decoder(v, b));
      } else {
        decoder = ctx[attr].decoder;
      }

      if (ctx[attr].isMany) {
        result = [...res].map(([, , v]) =>
          decoder(v.slice(0), async () => await kb.blobdb.get(v))
        );
      } else {
        const { done, value } = res.next();
        if (done) return { found: false };
        const [, , v] = value;
        result = decoder(v.slice(0), async () => await kb.blobdb.get(v));
      }

      return { found: true, result };
    }
  };

  return new Proxy(
    { [id]: entityId },
    {
      get: function (o, attr) {
        if (!(attr in ctx)) {
          return undefined;
        }

        if (attr in o) {
          return o[attr];
        }

        const { found, result } = lookup(o, attr);
        if (found) {
          Object.defineProperty(o, attr, {
            value: result,
            writable: false,
            configurable: false,
            enumerable: true,
          });
          return result;
        }
        return undefined;
      },
      set: function (_, attr) {
        throw TypeError(
          "Error: Entities are not writable, please use 'with' on the walked KB.",
        );
      },
      has: function (o, attr) {
        if (!(attr in ctx)) {
          return false;
        }

        if (attr in o || ctx[attr].isMany || ctx[attr].isInverseLink) {
          // This does include isInverseLink, because of an interaction between the distributed OWA
          // and the local CWA. We do not have knowledge about all other distributed entities,
          // therefore we can only assume an isMany relationship.
          return true;
        }
        const aId = new Uint8Array(VALUE_SIZE);
        ctx[id].encoder(ctx[attr].id, aId);
        const { done } = unsafeQuery(
          [
            new ConstantConstraint(0, eId),
            new ConstantConstraint(1, aId),
            new TripleConstraint(kb.tribledb, [0, 1, 2]),
          ],
          3,
          2,
        )
          .next();
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
      getOwnPropertyDescriptor: function (o, attr) {
        if (!(attr in ctx)) {
          return undefined;
        }

        if (attr in o) {
          return Object.getOwnPropertyDescriptor(o, attr);
        }

        const { found, result } = lookup(o, attr);
        if (found) {
          const property = {
            value: result,
            writable: false,
            configurable: false,
            enumerable: true,
          };
          Object.defineProperty(o, attr, property);
          return property;
        }
        return undefined;
      },
      ownKeys: function (_) {
        const attrs = [id];
        for (
          const [e, a, v] of unsafeQuery(
            [
              new ConstantConstraint(0, eId),
              new IndexConstraint(1, attrsById),
              new TripleConstraint(kb.tribledb, [0, 1, 2]),
            ],
            3,
            2,
          )
        ) {
          attrs.push(...attrsById.get(a));
        }
        for (
          const [e, a, v] of unsafeQuery(
            [
              new ConstantConstraint(0, eId),
              new TripleConstraint(kb.tribledb, [2, 1, 0]),
              new IndexConstraint(1, inverseAttrsById),
            ],
            3,
            2,
          )
        ) {
          attrs.push(...inverseAttrsById.get(a));
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

const entitiesToTriples = (ctx, unknowns, root) => {
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
      (!w.parent_id ||
        ctx[w.parent_attr].isLink ||
        ctx[w.parent_attr].isInverseLink) &&
      isPojo(w.value)
      // Note: It's tempting to perform more specific error checks here.
      // E.g. catching cases where a change from a cardinality many to a cardinality one
      // still passes an array instead of a POJO.
      // However this is not possible, since the 'id' type is configurable through the context,
      // and with JS being too dynamic to perform an appropriate type check.
      // The cardinality example above might, for instance, use a context in which id's
      // are represented as arrays of numbers. In which case an array be a valid id.
      // And again without knowing the type of the array there is no non-trivial/performant
      // way to distinguish between the byte array of an id, and an entity array.
    ) {
      const entityId = w.value[id] || unknowns.next().value;
      if (w.parent_id) {
        if (ctx[w.parent_attr].isInverseLink) {
          triples.push({
            path: w.path,
            triple: [entityId, w.parent_attr, w.parent_id],
          });
        } else {
          triples.push({
            path: w.path,
            triple: [w.parent_id, w.parent_attr, entityId],
          });
        }
      }
      for (const [attr, value] of Object.entries(w.value)) {
        if (!ctx[attr]) {
          throw Error(
            `Error at path [${w.path}]: No attribute named '${attr}' in ctx.`,
          );
        }
        if (ctx[attr].isInverseLink) {
          if (!(value instanceof Array)) {
            throw Error(
              `Error at path [${w.path}]: Inverse Attribute '${attr}' needs an array.`,
            );
          }
          for (const [i, v] of value.entries()) {
            work.push({
              path: [...w.path, attr, i],
              value: v,
              parent_id: entityId,
              parent_attr: attr,
            });
          }
        } else if (ctx[attr].isMany || ctx[attr].isInverseLink) {
          if (!(value instanceof Array)) {
            if (ctx[attr].isMany) {
              throw Error(
                `Error at path [${w.path}]: Attribute '${attr}' with cardinality "many" needs an array.`,
              );
            } else {
              throw Error(
                `Error at path [${w.path}]: Inverse Attribute '${attr}' needs an array.`,
              );
            }
          }
          for (const [i, v] of value.entries()) {
            work.push({
              path: [...w.path, attr, i],
              value: v,
              parent_id: entityId,
              parent_attr: attr,
            });
          }
        } else {
          work.push({
            path: [...w.path, attr],
            value,
            parent_id: entityId,
            parent_attr: attr,
          });
        }
      }
    } else {
      if (ctx[w.parent_attr].isInverseLink) {
        triples.push({
          path: w.path,
          triple: [w.value, w.parent_attr, w.parent_id],
        });
      } else {
        triples.push({
          path: w.path,
          triple: [w.parent_id, w.parent_attr, w.value],
        });
      }
    }
  }
  return triples;
};

const triplesToTribles = function (ctx, triples, tribles = [], blobs = []) {
  for (
    const {
      path,
      triple: [entity, attr, value],
    } of triples
  ) {
    const triple = new Uint8Array(TRIBLE_SIZE);
    const encodedValue = V(triple);
    let blob;
    try {
      const encoder = ctx[attr].isLink || ctx[attr].isInverseLink
        ? ctx[id].encoder
        : ctx[attr].encoder;
      if (!encoder) {
        throw Error("No encoder in context.");
      }
      blob = encoder(
        value,
        encodedValue,
      );
    } catch (err) {
      throw Error(
        `Error at path [${path}]:Couldn't encode '${value}' as value for attribute '${attr}':\n${err}`,
      );
    }
    try {
      ctx[id].encoder(entity, E(triple));
    } catch (err) {
      throw Error(
        `Error at path [${path}]:Couldn't encode '${entity}' as entity id:\n${err}`,
      );
    }
    try {
      ctx[id].encoder(ctx[attr].id, A(triple));
    } catch (err) {
      throw Error(
        `Error at path [${path}]:Couldn't encode id '${
          ctx[attr].id
        }' of attr '${attr}' in ctx:\n${err}`,
      );
    }

    tribles.push(triple);
    if (blob) {
      blobs.push([encodedValue, blob]);
    }
  }
  return { triples: tribles, blobs };
};

const precompileTriples = (ctx, vars, triples) => {
  const precompiledTriples = [];
  for (
    const {
      path,
      triple: [entity, attr, value],
    } of triples
  ) {
    let entityVar;
    let attrVar;
    let valueVar;

    try {
      if (entity instanceof Variable) {
        if (entity.decoder) {
          if (entity.decoder !== ctx[id].decoder) {
            throw new Error(
              `Error at paths ${entity.paths} and [${
                path.slice(
                  0,
                  -1,
                )
              }]:\n Variables at positions use incompatible decoders '${entity.decoder.name}' and '${
                ctx[id].decoder.name
              }'.`,
            );
          }
        } else {
          entity.decoder = ctx[id].decoder;
          entity.paths.push(path.slice(0, -1));
        }
        entityVar = entity;
      } else {
        const b = new Uint8Array(VALUE_SIZE);
        ctx[id].encoder(entity, b);
        entityVar = vars.constant(b);
      }
    } catch (error) {
      throw Error(
        `Error encoding entity at [${path.slice(0, -1)}]: ${error.message}`,
      );
    }
    try {
      const b = new Uint8Array(VALUE_SIZE);
      ctx[id].encoder(ctx[attr].id, b);
      attrVar = vars.constant(b);
    } catch (error) {
      throw Error(
        `Error encoding attribute at [${path.slice}]: ${error.message}`,
      );
    }
    try {
      if (value instanceof Variable) {
        const decoder = ctx[attr].isLink || ctx[attr].isInverseLink
          ? ctx[id].decoder
          : ctx[attr].decoder;
        if (!decoder) {
          throw Error("No decoder in context.");
        }
        if (value.decoder) {
          if (value.decoder !== decoder) {
            throw new Error(
              `Error at paths ${value.paths} and [${path}]:\n Variables at positions use incompatible decoders '${value.decoder.name}' and '${decoder.name}'.`,
            );
          }
        } else {
          value.decoder = decoder;
          value.paths.push([...path]);
        }
        valueVar = value;
      } else {
        const encoder = ctx[attr].isLink || ctx[attr].isInverseLink
          ? ctx[id].encoder
          : ctx[attr].encoder;
        if (!encoder) {
          throw Error("No encoder in context.");
        }
        const b = new Uint8Array(VALUE_SIZE);
        encoder(value, b);
        valueVar = vars.constant(b);
      }
    } catch (error) {
      throw Error(`Error encoding value at [${path}]: ${error.message}`);
    }
    precompiledTriples.push([entityVar, attrVar, valueVar]);
  }

  return precompiledTriples;
};

function* find(ctx, cfn, blobdb) {
  const vars = new VariableProvider();
  const constraintBuilderPrepares = cfn(vars.named());
  const constraintBuilders = constraintBuilderPrepares.map((prepare) =>
    prepare(ctx, vars)
  );
  vars.arrange();

  const variableCount = vars.variables.length;
  const namedVariables = [...vars.namedVariables.values()];

  const constraints = constraintBuilders.flatMap((builder) => builder());
  constraints.push(
    ...[...vars.constantVariables.values()].map((v) =>
      new ConstantConstraint(v.index, v.constant)
    ),
  );

  for (
    const r of unsafeQuery(
      constraints,
      variableCount,
      variableCount,
      vars.variables.map((v) => v.ascending),
    )
  ) {
    yield Object.fromEntries(
      namedVariables.map(
        ({ index, walked, decoder, name }) => {
          const encoded = r[index];
          const decoded = decoder(
            encoded.slice(0),
            async () => await blobdb.get(encoded),
          );
          return [name, walked ? walked.walk(ctx, decoded) : decoded];
        },
      ),
    );
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

  with(ctx, efn) {
    const ids = new IDSequence();
    const entities = efn(ids);
    const rawTriples = entitiesToTriples(ctx, ids, entities);
    const { triples, blobs } = triplesToTribles(ctx, rawTriples);
    const newTribleDB = this.tribledb.with(triples);
    if (newTribleDB !== this.tribledb) {
      const newBlobDB = this.blobdb.put(blobs);
      return new TribleKB(newTribleDB, newBlobDB);
    }
    return this;
  }

  find(ctx, efn) {
    return find(ctx, (vars) => [this.where(efn(vars))], this.blobdb);
  }

  where(entities) {
    return (ctx, vars) => {
      const triples = entitiesToTriples(ctx, vars.unnamed(), entities);
      const triplesWithVars = precompileTriples(ctx, vars, triples);
      return () => [
        ...triplesWithVars.map(([{ index: e }, { index: a }, { index: v }]) =>
          new TripleConstraint(this.tribledb, [e, a, v])
        ),
      ];
    };
  }

  walk(ctx, entityId) {
    return entityProxy(this, ctx, entityId);
  }

  empty() {
    return new TribleKB(this.tribledb.empty(), this.blobdb.empty());
  }

  equals(other) {
    return this.tribledb.equals(other.tribledb) &&
      this.blobdb.equals(other.blobdb);
  }

  isEmpty() {
    return this.tribledb.isEmpty();
  }

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

module.exports = { find, id, TribleKB };
