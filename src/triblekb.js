import { v4 } from "https://deno.land/std@0.78.0/uuid/mod.ts";

import { VALUE_PART } from "./part.js";
import {
  CollectionConstraint,
  ConstantConstraint,
  IndexConstraint,
  TribleDB,
  TripleConstraint,
  unsafeQuery,
} from "./tribledb.js";
import { A, E, TRIBLE_SIZE, V, VALUE_SIZE } from "./trible.js";

const id = Symbol("id");

class Variable {
  constructor(provider, name = null, index = null, ascending = true) {
    this.provider = provider;
    this.index = index;
    this.name = name;
    this.ascending = ascending;
    this.walked = false;
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

  walk() {
    this.walked = true;
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
    this.variableNames = {};
    this.namedVariables = [];
    this.unnamedVariables = [];
  }

  named() {
    return new Proxy(this, {
      get: function (provider, name) {
        let v = provider.namedVariables[name];
        if (v) {
          return v;
        }
        v = new Variable(provider, name);
        provider.variableNames[name] = v;
        provider.namedVariables.push(v);
        return v;
      },
    });
  }

  arrange() {
    let vProbe = 0;
    for (const v of [...this.unnamedVariables, ...this.namedVariables]) {
      if (v.index === null) {
        while (this.variables[vProbe]) {
          vProbe++;
        }
        v.index = vProbe;
        this.variables[vProbe] = v;
      }
    }
  }

  [Symbol.iterator]() {
    return this;
  }
  next() {
    const variable = new Variable(this);
    this.unnamedVariables.push(variable);
    return { value: variable };
  }
}

class IDSequence {
  constructor() {}

  [Symbol.iterator]() {
    return this;
  }
  next() {
    return { value: v4.generate() };
  }
}

const entityProxy = function entityProxy(kb, ctx, entityId) {
  const attrsBatch = VALUE_PART.batch();
  const inverseAttrsBatch = VALUE_PART.batch();
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
          new TripleConstraint(kb.db, [2, 1, 0]),
        ],
        3,
      );
      const decoder = (v, b) => entityProxy(kb, ctx, ctx[id].decoder(v, b));
      const result = [...res].map(([_e, _a, v]) =>
        decoder(v, () => kb.db.blob(v))
      );

      return { found: true, result };
    } else {
      const res = unsafeQuery(
        [
          new ConstantConstraint(0, eId),
          new ConstantConstraint(1, aId),
          new TripleConstraint(kb.db, [0, 1, 2]),
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
        result = [...res].map(([_e, _a, v]) => decoder(v, () => kb.db.blob(v)));
      } else {
        const { done, value } = res.next();
        if (done) return { found: false };
        const [e, a, v] = value;
        result = decoder(v, () => kb.db.blob(v));
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
            new TripleConstraint(kb.db, [0, 1, 2]),
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
              new TripleConstraint(kb.db, [0, 1, 2]),
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
              new TripleConstraint(kb.db, [2, 1, 0]),
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

const entitiesToFacts = (ctx, unknowns, root, facts = []) => {
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
          facts.push({
            path: w.path,
            fact: [entityId, w.parent_attr, w.parent_id],
          });
        } else {
          facts.push({
            path: w.path,
            fact: [w.parent_id, w.parent_attr, entityId],
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
        facts.push({
          path: w.path,
          fact: [w.value, w.parent_attr, w.parent_id],
        });
      } else {
        facts.push({
          path: w.path,
          fact: [w.parent_id, w.parent_attr, w.value],
        });
      }
    }
  }
  return facts;
};

const encodeFacts = function (ctx, rawFacts, facts = [], blobs = []) {
  for (
    const {
      path,
      fact: [entity, attr, value],
    } of rawFacts
  ) {
    const fact = new Uint8Array(TRIBLE_SIZE);
    const encodedValue = V(fact);
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
      ctx[id].encoder(entity, E(fact));
    } catch (err) {
      throw Error(
        `Error at path [${path}]:Couldn't encode '${entity}' as entity id:\n${err}`,
      );
    }
    try {
      ctx[id].encoder(ctx[attr].id, A(fact));
    } catch (err) {
      throw Error(
        `Error at path [${path}]:Couldn't encode id '${
          ctx[attr].id
        }' of attr '${attr}' in ctx:\n${err}`,
      );
    }

    facts.push(fact);
    if (blob) {
      blobs.push([encodedValue, blob]);
    }
  }
  return { facts, blobs };
};

const compileQuery = (ctx, raw_facts) => {
  let constants = VALUE_PART;
  const variables = [];
  const facts = [];
  for (
    const {
      path,
      fact: [entity, attr, value],
    } of raw_facts
  ) {
    let encodedEntity;
    const encodedAttr = new Uint8Array(VALUE_SIZE);
    let encodedValue = new Uint8Array(VALUE_SIZE);

    try {
      if (entity instanceof Variable) {
        if (variables[entity.index]) {
          if (variables[entity.index].decoder !== ctx[id].decoder) {
            throw new Error(
              `Error at paths [${variables[entity.index].path}] and [${
                path.slice(
                  0,
                  -1,
                )
              }]:\n Variables at positions use incompatible decoders '${
                variables[entity.index].decoder.name
              }' and '${ctx[id].decoder.name}'.`,
            );
          }
        } else {
          variables[entity.index] = {
            decoder: ctx[id].decoder,
            path: path.slice(0, -1),
          };
        }
        encodedEntity = entity;
      } else {
        encodedEntity = new Uint8Array(VALUE_SIZE);
        ctx[id].encoder(entity, encodedEntity);
        constants = constants.put(encodedEntity, () => ({}));
      }
    } catch (error) {
      throw Error(
        `Error encoding entity at [${path.slice(0, -1)}]: ${error.message}`,
      );
    }
    try {
      ctx[id].encoder(ctx[attr].id, encodedAttr);
      constants = constants.put(encodedAttr, () => ({}));
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
        if (variables[value.index]) {
          if (variables[value.index].decoder !== decoder) {
            throw new Error(
              `Error at paths [${variables[value.index].path}] and [${
                path.slice(
                  0,
                  -1,
                )
              }]:\n Variables at positions use incompatible decoders '${
                variables[value.index].decoder.name
              }' and '${decoder.name}'.`,
            );
          }
        } else {
          variables[value.index] = {
            decoder,
            path,
          };
        }
        encodedValue = value;
      } else {
        const encoder = ctx[attr].isLink || ctx[attr].isInverseLink
          ? ctx[id].encoder
          : ctx[attr].encoder;
        if (!encoder) {
          throw Error("No encoder in context.");
        }
        encoder(value, encodedValue);
        constants = constants.put(encodedValue, () => ({}));
      }
    } catch (error) {
      throw Error(`Error encoding value at [${path}]: ${error.message}`);
    }
    facts.push([encodedEntity, encodedAttr, encodedValue]);
  }
  const c = constants.cursor();
  c.push(VALUE_SIZE);
  const bindings = [];
  for (; c.valid; c.next()) {
    const v = c.value();
    v.index = bindings.length;
    bindings.push(c.peek());
  }

  return {
    query: facts.map((f) =>
      f.map((x) => {
        if (x instanceof Variable) {
          return bindings.length + x.index;
        } else {
          return constants.get(x).index;
        }
      })
    ),
    bindings: bindings,
    variableCount: bindings.length + variables.length,
    decoders: variables.map(({ decoder }) => decoder),
  };
};

class TribleKB {
  constructor(db = new TribleDB()) {
    this.db = db;
  }

  withRaw(tribles, blobs) {
    const db = this.db.with(tribles, blobs);
    if (db === this.db) {
      return this;
    }
    return new TribleKB(db);
  }

  with(ctx, cfn) {
    const ids = new IDSequence();
    const entities = cfn(ids);
    const rawFacts = entitiesToFacts(ctx, ids, entities);
    const { facts, blobs } = encodeFacts(ctx, rawFacts);
    const ndb = this.db.with(facts, blobs);
    if (ndb !== this.db) {
      return new TribleKB(ndb, this.types);
    }
    return this;
  }
  *find(ctx, qfn) {
    const vars = new VariableProvider();
    const q = qfn(vars.named());
    const facts = entitiesToFacts(ctx, vars, q);
    vars.arrange();

    const { query, bindings, variableCount, decoders } = compileQuery(
      ctx,
      facts,
    );

    for (
      const r of unsafeQuery(
        [
          ...bindings.map(
            (value, variable) => new ConstantConstraint(variable, value),
          ),
          ...query.map((triple) => new TripleConstraint(this.db, triple)),
        ],
        variableCount,
        variableCount,
        [
          ...new Array(bindings.length).fill(true),
          ...vars.variables.map((v) => v.ascending),
        ],
      )
    ) {
      yield Object.fromEntries(
        Object.entries(vars.variableNames).map(([name, { index, walked }]) => {
          const decoded = decoders[index](
            r[bindings.length + index],
            () => this.db.blob(r[bindings.length + index]),
          );
          return [name, walked ? this.walk(ctx, decoded) : decoded];
        }),
      );
    }
  }
  walk(ctx, id) {
    return entityProxy(this, ctx, id);
  }
}

export { id, TribleKB };
