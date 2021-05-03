const { emptyIdPACT, emptyValuePACT } = require("./pact.js");
const {   constantConstraint,
  indexConstraint,
  OrderByMinCost,
  OrderByMinCostAndBlockage,
  resolve, } = require("./query.js");
const { A, E, equalValue, TRIBLE_SIZE, V, VALUE_SIZE } = require("./trible.js");


const id = Symbol("id");

class Variable {
  constructor(provider, index, name = null) {
    this.provider = provider;
    this.index = index;
    this.name = name;
    this.ascending = true;
    this.walked = null;
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
      potentialCycles = new Set(
        this.provider.blockedBy.filter(([a, b]) => potentialCycles.has(a)).map((
          [a, b],
        ) => b),
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
    this.nextVariableIndex = 0;
    this.variables = [];
    this.unnamedVariables = [];
    this.namedVariables = new Map();
    this.constantVariables = emptyValuePACT;
    this.blockedBy = [];
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
          variable = new Variable(this, this.nextVariableIndex++, name);
          this.namedVariables.set(name, variable);
          this.variables.push(variable);
          return variable;
        },
      },
    );
  }

  unnamed() {
    const variable = new Variable(this, this.nextVariableIndex++);
    this.unnamedVariables.push(variable);
    this.variables.push(variable);
    return variable;
  }

  constant(c) {
    let variable = this.constantVariables.get(c);
    if (!variable) {
      variable = new Variable(this, this.nextVariableIndex++);
      variable.constant = c;
      this.constantVariables = this.constantVariables.put(c, variable);
      this.variables.push(variable);
    }
    return variable;
  }
}

const entityProxy = function entityProxy(kb, ctx, entityId) {
  const eId = new Uint8Array(VALUE_SIZE);
  ctx.ns[id].encoder(entityId, eId);

  const lookup = (o, attr) => {
    const { isInverse, id: attrId } = ctx.ns[attr];

    const aId = new Uint8Array(VALUE_SIZE);
    ctx.ns[id].encoder(attrId, aId);

    const res = resolve(
      [
        constantConstraint(0, eId),
        constantConstraint(1, aId),
        kb.tribledb.constraint(...(isInverse ? [2, 1, 0] : [0, 1, 2])),
      ],
      new OrderByMinCost(),
      new Set([0, 1, 2]),
      [
        new Uint8Array(VALUE_SIZE),
        new Uint8Array(VALUE_SIZE),
        new Uint8Array(VALUE_SIZE),
      ],
    );

    let decoder;
    const { isLink, isUnique, isUniqueInverse } =
      ctx.constraints[ctx.ns[attr].id];
    if (isLink) {
      decoder = (v, b) => entityProxy(kb, ctx, ctx.ns[id].decoder(v, b));
    } else {
      decoder = ctx.ns[attr].decoder;
    }

    if ((!isInverse && isUnique) || (isInverse && isUniqueInverse)) {
      const { done, value } = res.next();
      if (done) return { found: false };
      const [, , v] = value;
      return {
        found: true,
        result: decoder(v.slice(0), async () => await kb.blobdb.get(v)),
      };
    } else {
      return {
        found: true,
        result: [...res].map(([, , v]) =>
          decoder(v.slice(0), async () => await kb.blobdb.get(v))
        ),
      };
    }
  };

  return new Proxy(
    { [id]: entityId },
    {
      get: function (o, attr) {
        if (!(attr in ctx.ns)) {
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
        if (!(attr in ctx.ns)) {
          return false;
        }

        const attrId = ctx.ns[attr].id;
        if (
          attr in o ||
          !ctx.constraints[attrId].isUnique ||
          (ctx.ns[attr].isInverse &&
            !ctx.constraints[attrId].isUniqueInverse)
        ) {
          return true;
        }
        const aId = new Uint8Array(VALUE_SIZE);
        ctx.ns[id].encoder(attrId, aId);
        const { done } = resolve(
          [
            constantConstraint(0, eId),
            constantConstraint(1, aId),
            kb.tribledb.constraint(
              ...(
                ctx.ns[attr].isInverse ? [2, 1, 0] : [0, 1, 2]
              ),
            ),
          ],
          new OrderByMinCost(),
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
      getOwnPropertyDescriptor: function (o, attr) {
        if (!(attr in ctx.ns)) {
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
          const [e, a, v] of resolve(
            [
              constantConstraint(0, eId),
              indexConstraint(1, ctx.attrsIndex),
              kb.tribledb.constraint(0, 1, 2),
            ],
            new OrderByMinCost(),
            new Set([0, 1, 2]),
            [
              new Uint8Array(VALUE_SIZE),
              new Uint8Array(VALUE_SIZE),
              new Uint8Array(VALUE_SIZE),
            ],
          )
        ) {
          attrs.push(...ctx.attrsIndex.get(a));
        }
        for (
          const [e, a, v] of resolve(
            [
              constantConstraint(0, eId),
              kb.tribledb.constraint(2, 1, 0),
              indexConstraint(1, ctx.inverseAttrsIndex),
            ],
            new OrderByMinCost(),
            new Set([0, 1, 2]),
            [
              new Uint8Array(VALUE_SIZE),
              new Uint8Array(VALUE_SIZE),
              new Uint8Array(VALUE_SIZE),
            ],
          )
        ) {
          attrs.push(...ctx.inverseAttrsIndex.get(a));
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

const entitiesToTriples = (ctx, unknownFactory, root) => {
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
      (!w.parent_id || ctx.constraints[w.parent_attr_id].isLink) &&
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
      const entityId = w.value[id] || unknownFactory();
      if (w.parent_id) {
        if (ctx.ns[w.parent_attr].isInverse) {
          triples.push({
            path: w.path,
            attr: w.parent_attr,
            triple: [entityId, w.parent_attr_id, w.parent_id],
          });
        } else {
          triples.push({
            path: w.path,
            attr: w.parent_attr,
            triple: [w.parent_id, w.parent_attr_id, entityId],
          });
        }
      }
      for (const [attr, value] of Object.entries(w.value)) {
        if (!ctx.ns[attr]) {
          throw Error(
            `Error at pathBytes [${w.path}]: No attribute named '${attr}' in ctx.`,
          );
        }
        const attrId = ctx.ns[attr].id;
        if (!ctx.constraints[attrId]) {
          throw Error(
            `Error at pathBytes [${w.path}]: No id '${attrId}' in ctx.`,
          );
        }
        if (
          (!ctx.ns[attr].isInverse &&
            !ctx.constraints[attrId].isUnique) ||
          (ctx.ns[attr].isInverse &&
            !ctx.constraints[attrId].isUniqueInverse)
        ) {
          if (!(value instanceof Array)) {
            if (ctx.ns[attr].isInverse) {
              throw Error(
                `Error at pathBytes [${w.path}]: '${attr}' is not unique inverse constrained and needs array.`,
              );
            }
            throw Error(
              `Error at pathBytes [${w.path}]: '${attr}' is not unique constrained and needs array.`,
            );
          }
          for (const [i, v] of value.entries()) {
            work.push({
              path: [...w.path, attr, i],
              value: v,
              parent_id: entityId,
              parent_attr: attr,
              parent_attr_id: attrId,
            });
          }
        } else {
          work.push({
            path: [...w.path, attr],
            value,
            parent_id: entityId,
            parent_attr: attr,
            parent_attr_id: attrId,
          });
        }
      }
    } else {
      if (ctx.ns[w.parent_attr].isInverse) {
        triples.push({
          path: w.path,
          attr: w.parent_attr,
          triple: [w.value, w.parent_attr_id, w.parent_id],
        });
      } else {
        triples.push({
          path: w.path,
          attr: w.parent_attr,
          triple: [w.parent_id, w.parent_attr_id, w.value],
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
      attr,
      triple: [entity, attrId, value],
    } of triples
  ) {
    const trible = new Uint8Array(TRIBLE_SIZE);
    const encodedValue = V(trible);
    let blob;
    try {
      const encoder = ctx.constraints[attrId].isLink
        ? ctx.ns[id].encoder
        : ctx.ns[attr].encoder;
      if (!encoder) {
        throw Error("No encoder in context.");
      }
      blob = encoder(value, encodedValue);
    } catch (err) {
      throw Error(
        `Error at path [${path}]:Couldn't encode '${value}' as value for attribute '${attr}':\n${err}`,
      );
    }
    try {
      ctx.ns[id].encoder(entity, E(trible));
    } catch (err) {
      throw Error(
        `Error at path[${path}]:Couldn't encode '${entity}' as entity id:\n${err}`,
      );
    }
    try {
      ctx.ns[id].encoder(attrId, A(trible));
    } catch (err) {
      throw Error(
        `Error at path [${path}]:Couldn't encode id '${attrId}' of attr '${attr}' in ctx:\n${err}`,
      );
    }

    tribles.push(trible);
    if (blob) {
      blobs.push([encodedValue, blob]);
    }
  }
  return { tribles, blobs };
};

const precompileTriples = (ctx, vars, triples) => {
  const precompiledTriples = [];
  for (
    const {
      path,
      attr,
      triple: [entity, attrId, value],
    } of triples
  ) {
    let entityVar;
    let attrVar;
    let valueVar;

    try {
      if (entity instanceof Variable) {
        if (entity.decoder) {
          if (entity.decoder !== ctx.ns[id].decoder) {
            throw new Error(
              `Error at paths ${entity.paths} and [${
                path.slice(
                  0,
                  -1,
                )
              }]:\n Variables at positions use incompatible decoders '${entity.decoder.name}' and '${
                ctx.ns[id].decoder.name
              }'.`,
            );
          }
        } else {
          entity.decoder = ctx.ns[id].decoder;
          entity.paths.push(path.slice(0, -1));
        }
        entityVar = entity;
      } else {
        const b = new Uint8Array(VALUE_SIZE);
        ctx.ns[id].encoder(entity, b);
        entityVar = vars.constant(b);
      }
    } catch (error) {
      throw Error(
        `Error encoding entity at [${path.slice(0, -1)}]: ${error.message}`,
      );
    }
    try {
      const b = new Uint8Array(VALUE_SIZE);
      ctx.ns[id].encoder(attrId, b);
      attrVar = vars.constant(b);
    } catch (error) {
      throw Error(
        `Error encoding attribute at [${path.slice}]: ${error.message}`,
      );
    }
    try {
      if (value instanceof Variable) {
        const decoder = ctx.constraints[attrId].isLink
          ? ctx.ns[id].decoder
          : ctx.ns[attr].decoder;
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
        const encoder = ctx.constraints[attrId].isLink
          ? ctx.ns[id].encoder
          : ctx.ns[attr].encoder;
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
  const constraintBuilderPrepares = cfn(vars.namedCache());
  const constraintBuilders = constraintBuilderPrepares.map((prepare) =>
    prepare(ctx, vars)
  );

  const namedVariables = [...vars.namedVariables.values()];

  const constraints = constraintBuilders.flatMap((builder) => builder());
  constraints.push(
    ...[...vars.constantVariables.values()].map(
      (v) => constantConstraint(v.index, v.constant),
    ),
  );

  for (
    const r of resolve(
      constraints,
      new OrderByMinCostAndBlockage(vars.blockedBy),
      new Set(vars.variables.filter((v) => v.ascending).map((v) => v.index)),
      vars.variables.map((v) => new Uint8Array(VALUE_SIZE)),
    )
  ) {
    const result = {};
    for (const { index, walked, decoder, name, isOmit } of namedVariables) {
      if (!isOmit) {
        const encoded = r[index];
        const decoded = decoder(
          encoded.slice(0),
          async () => await blobdb.get(encoded),
        );
        result[name] = walked ? walked.walk(decoded, ctx) : decoded;
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
  constructor(ctx, tribledb, blobdb) {
    this.ctx = ctx;
    this.tribledb = tribledb;
    this.blobdb = blobdb;
  }

  withTribles(tribles) {
    const tribledb = this.tribledb.with(tribles);
    if (tribledb === this.tribledb) {
      return this;
    }
    return new TribleKB(this.ctx, tribledb, this.blobdb);
  }

  with(efn) {
    const idFactory = this.ctx.ns[id].factory;
    const entities = efn(new IDSequence(idFactory));
    const triples = entitiesToTriples(this.ctx, idFactory, entities);
    const { tribles, blobs } = triplesToTribles(this.ctx, triples);
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
            indexConstraint(1, this.ctx.uniqueAttributeIndex),
            newTribleDB.constraint(0, 1, 2),
          ],
          new OrderByMinCostAndBlockage([[2, 0], [2, 1]]),
          new Set([0, 1, 2]),
          [
            new Uint8Array(VALUE_SIZE),
            new Uint8Array(VALUE_SIZE),
            new Uint8Array(VALUE_SIZE),
          ],
        )
      ) {
        if (
          prevE !== null && prevA !== null &&
          equalValue(prevE, e) &&
          equalValue(prevA, a)
        ) {
          throw Error(
            `Constraint violation: Unique attribute '${
              this.ctx.ns[id].decoder(a)
            }' has multiple values on '${this.ctx.ns[id].decoder(e)}'.`,
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
            indexConstraint(1, this.ctx.uniqueInverseAttributeIndex),
            newTribleDB.constraint(0, 1, 2),
          ],
          new OrderByMinCostAndBlockage([[0, 1], [0, 2]]),
          new Set([0, 1, 2]),
          [
            new Uint8Array(VALUE_SIZE),
            new Uint8Array(VALUE_SIZE),
            new Uint8Array(VALUE_SIZE),
          ],
        )
      ) {
        if (
          prevA !== null && prevV !== null &&
          equalValue(prevA, a) &&
          equalValue(prevV, v)
        ) { //TODO make errors pretty.
          throw Error(
            `Constraint violation: Unique inverse attribute '${
              this.ctx.ns[id].decoder(a)
            }' has multiple entities for '${v}'.`,
          );
        }
        prevA = a.slice();
        prevV = v.slice();
      }

      const newBlobDB = this.blobdb.put(blobs);
      return new TribleKB(this.ctx, newTribleDB, newBlobDB);
    }
    return this;
  }

  find(efn) {
    return find(this.ctx, (vars) => [this.where(efn(vars))], this.blobdb);
  }

  where(entities) {
    return (ctx, vars) => {
      const triples = entitiesToTriples(ctx, () => vars.unnamed(), entities);
      const triplesWithVars = precompileTriples(ctx, vars, triples);
      return () => [
        ...triplesWithVars.map(
          ([{ index: e }, { index: a }, { index: v }]) =>
            this.tribledb.constraint(e, a, v),
        ),
      ];
    };
  }

  walk(entityId, ctx = this.ctx) {
    return entityProxy(this, ctx, entityId);
  }

  empty() {
    return new TribleKB(this.tribledb.empty(), this.blobdb.empty());
  }

  isEmpty() {
    return this.tribledb.isEmpty();
  }

  isEqual(other) {
    return (
      this.tribledb.isEqual(other.tribledb) && this.blobdb.isEqual(other.blobdb)
    );
  }

  isSubsetOf(other) {
    return this.tribledb.isSubsetOf(other.tribledb);
  }

  isIntersecting(other) {
    return this.tribledb.isIntersecting(other.tribledb);
  }

  union(other) {
    const tribledb = this.tribledb.union(other.tribledb);
    const blobdb = this.blobdb.merge(other.blobdb);
    return new TribleKB(ctx(this.ctx, other.ctx), tribledb, blobdb);
  }

  subtract(other) {
    const tribledb = this.tribledb.subtract(other.tribledb);
    const blobdb = this.blobdb.merge(other.blobdb).shrink(tribledb);
    return new TribleKB(this.ctx, tribledb, blobdb);
  }

  difference(other) {
    const tribledb = this.tribledb.difference(other.tribledb);
    const blobdb = this.blobdb.merge(other.blobdb).shrink(tribledb);
    return new TribleKB(ctx(this.ctx, other.ctx), tribledb, blobdb);
  }

  intersect(other) {
    const tribledb = this.tribledb.intersect(other.tribledb);
    const blobdb = this.blobdb.merge(other.blobdb).shrink(tribledb);
    return new TribleKB(this.ctx, tribledb, blobdb);
  }
}

const ctx = (...ctxs) => {
  //TODO simply return first context if all contexts are equal.
  const outCtx = { ns: {}, constraints: {} };
  for (const { ns, constraints } of ctxs) {
    for (const [id, novel] of Object.entries(constraints)) {
      const existing = outCtx.constraints[id];
      if (existing) {
        if (Boolean(existing.isLink) !== Boolean(novel.isLink)) {
          throw Error(
            `Inconsistent ctx id "${id}": isLink:${existing.isLink} !== isLink:${novel.isLink}`,
          );
        }
        if (Boolean(existing.isUnique) !== Boolean(novel.isUnique)) {
          throw Error(
            `Inconsistent ctx id "${id}": isUnique:${existing.isUnique} !== isUnique:${novel.isUnique}`,
          );
        }
        if (
          Boolean(existing.isUniqueInverse) !== Boolean(novel.isUniqueInverse)
        ) {
          throw Error(
            `Inconsistent ctx id "${id}": isUniqueInverse:${existing.isUniqueInverse} !== isUniqueInverse:${novel.isUniqueInverse}`,
          );
        }
      } else {
        if (novel.isUniqueInverse && !novel.isLink) {
          throw Error(
            `Inconsistent ctx id "${id}": Only links can be inverse unique.`,
          );
        }
        outCtx.constraints[id] = novel;
      }
    }
  }
  for (const { ns, constraints } of ctxs) {
    if (ns[id] && !outCtx.ns[id]) {
      outCtx.ns[id] = ns[id];
    }
    if (ns[id] && outCtx.ns[id] && (ns[id] !== outCtx.ns[id])) {
      throw Error(
        `Inconsistent id types in ctx.`,
      );
    }
    for (const [name, novel] of Object.entries(ns)) {
      const existing = outCtx.ns[name];
      if (existing) {
        if (existing.id !== novel.id) {
          throw Error(
            `Inconsistent ctx attr "${name}": id:${existing.id} !== id:${novel.id}`,
          );
        }
        if (Boolean(existing.isInverse) !== Boolean(novel.isInverse)) {
          throw Error(
            `Inconsistent ctx attr "${name}": isInverse:${existing.isInverse} !== isInverse:${novel.isInverse}`,
          );
        }
        if (existing.decoder !== novel.decoder) {
          throw Error(
            `Inconsistent ctx attr "${name}": decoder:${existing.decoder} !== decoder:${novel.decoder}`,
          );
        }
        if (existing.encoder !== novel.encoder) {
          throw Error(
            `Inconsistent ctx attr "${name}": encoder:${existing.decoder} !== encoder:${novel.decoder}`,
          );
        }
      } else {
        if (!outCtx.constraints[novel.id]) {
          throw Error(
            `Inconsistent ctx: No constraints ${novel.id} in context for ${name}.`,
          );
        }
        if (novel.isInverse && !outCtx.constraints[novel.id].isLink) {
          throw Error(
            `Inconsistent ctx attr "${name}": Only links can be inverse.`,
          );
        }
        if (!(novel.decoder || outCtx.constraints[novel.id].isLink)) {
          throw Error(`Invalid ctx attr: No decoder in context for ${name}.`);
        }
        if (!(novel.encoder || outCtx.constraints[novel.id].isLink)) {
          throw Error(`Invalid ctx attr: No encoder in context for ${name}.`);
        }
        outCtx.ns[name] = novel;
      }
    }
  }
  if (!outCtx.ns[id]) {
    throw Error(`Incomplete ctx: Missing [id] field in ns.`);
  }
  if (!outCtx.ns[id].decoder) {
    throw Error(`Incomplete ctx: Missing [id] decoder in ns.`);
  }
  if (!outCtx.ns[id].encoder) {
    throw Error(`Incomplete ctx: Missing [id] encoder in ns.`);
  }
  if (!outCtx.ns[id].factory) {
    throw Error(`Incomplete ctx: Missing [id] factory in ns.`);
  }

  const uniqueAttributeIndex = emptyIdPACT.batch();
  const uniqueInverseAttributeIndex = emptyIdPACT.batch();

  const idEncoder = outCtx.ns[id].encoder;
  for (const [attrId, constraint] of Object.entries(outCtx.constraints)) {
    if (constraint.isUnique) {
      const encodedId = new Uint8Array(16);
      idEncoder(attrId, encodedId);
      uniqueAttributeIndex.put(encodedId);
    }
    if (constraint.isUniqueInverse) {
      const encodedId = new Uint8Array(16);
      idEncoder(attrId, encodedId);
      uniqueInverseAttributeIndex.put(encodedId);
    }
  }

  let attrsIndex = emptyValuePACT;
  let inverseAttrsIndex = emptyValuePACT;
  for (
    const [attr, { id: attrId, isInverse }] of Object.entries(outCtx.ns)
  ) {
    const aId = new Uint8Array(VALUE_SIZE);
    outCtx.ns[id].encoder(attrId, aId);
    let attrs;
    if (isInverse) {
      attrs = inverseAttrsIndex.get(aId);
      if (!attrs) {
        attrs = [];
        inverseAttrsIndex = inverseAttrsIndex.put(aId, attrs);
      }
    } else {
      attrs = attrsIndex.get(aId);
      if (!attrs) {
        attrs = [];
        attrsIndex = attrsIndex.put(aId, attrs);
      }
    }
    attrs.push(attr);
  }

  outCtx.uniqueAttributeIndex = uniqueAttributeIndex.complete();
  outCtx.uniqueInverseAttributeIndex = uniqueInverseAttributeIndex.complete();
  outCtx.attrsIndex = attrsIndex;
  outCtx.inverseAttrsIndex = inverseAttrsIndex;

  return outCtx;
};

module.exports = { ctx, find, id, TribleKB };
