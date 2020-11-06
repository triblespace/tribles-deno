import { v4 } from "https://deno.land/std@0.76.0/uuid/mod.ts";

import { VALUE_PART } from "./part.js";
import { TribleDB, UnsafeQuery } from "./tribledb.js";
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
    let v_probe = 0;
    for (const v of [...this.unnamedVariables, ...this.namedVariables]) {
      if (v.index === null) {
        while (this.variables[v_probe]) {
          v_probe++;
        }
        v.index = v_probe;
        this.variables[v_probe] = v;
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

const entityProxy = function entityProxy(kb, ctx, entity_id) {
  const attrs_batch = VALUE_PART.batch();
  const inverse_attrs_batch = VALUE_PART.batch();
  for (const [attr, { id: attr_id, isInverseLink }] of Object.entries(ctx)) {
    const a_id = new Uint8Array(VALUE_SIZE);
    ctx[id].encoder(attr_id, a_id);
    if (isInverseLink) {
      inverse_attrs_batch.put(a_id, (attrs = []) => [...attrs, attr]);
    } else {
      attrs_batch.put(a_id, (attrs = []) => [...attrs, attr]);
    }
  }
  const attrs_by_id = attrs_batch.complete();
  const inverse_attrs_by_id = inverse_attrs_batch.complete();

  const e_id = new Uint8Array(VALUE_SIZE);
  ctx[id].encoder(entity_id, e_id);

  const lookup = (o, attr) => {
    const a_id = new Uint8Array(VALUE_SIZE);
    ctx[id].encoder(ctx[attr].id, a_id);
    if (ctx[attr].isInverseLink) {
      const res = new UnsafeQuery([[2, 1, 0]], [e_id, a_id], [], 3).on(kb.db);
      let result;
      let decoder;
      decoder = (v, b) => entityProxy(kb, ctx, ctx[id].decoder(v, b));
      result = [...res].map(([_e, _a, v]) => decoder(v, () => kb.db.blob(v)));

      return { found: true, result };
    } else {
      const res = new UnsafeQuery([[0, 1, 2]], [e_id, a_id], [], 3).on(kb.db);
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
    { [id]: entity_id },
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
      set: function ({}, attr) {
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
        const a_id = new Uint8Array(VALUE_SIZE);
        ctx[id].encoder(ctx[attr].id, a_id);
        const { done } = new UnsafeQuery([[0, 1, 2]], [e_id, a_id], [], 3, 2)
          .on(kb.db)
          .next();
        return !done;
      },
      deleteProperty: function ({}, attr) {
        throw TypeError(
          "Error: Entities are not writable, furthermore KBs are append only.",
        );
      },
      setPrototypeOf: function ({}) {
        throw TypeError(
          "Error: Entities are not writable and can only be POJOs.",
        );
      },
      isExtensible: function ({}) {
        return true;
      },
      preventExtensions: function ({}) {
        return false;
      },
      defineProperty: function ({}, attr) {
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
      ownKeys: function ({}) {
        let attrs = [id];
        for (
          const [e, a, v] of new UnsafeQuery(
            [[0, 1, 2]],
            [e_id],
            [new IndexConstraint(1, attrs_by_id)],
            3,
            2,
          ).on(kb.db)
        ) {
          attrs.push(...attrs_by_id.get(a));
        }
        for (
          const [e, a, v] of new UnsafeQuery(
            [[2, 1, 0]],
            [e_id],
            [new IndexConstraint(1, inverse_attrs_by_id)],
            3,
            2,
          ).on(kb.db)
        ) {
          attrs.push(...inverse_attrs_by_id.get(a));
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

const entities_to_facts = (ctx, unknowns, root, facts = []) => {
  const work = [];
  const root_is_array = root instanceof Array;
  const root_is_object = typeof root === "object" && root !== null;
  if (root_is_array) {
    for (const [index, entity] of root.entries()) {
      work.push({ path: [index], value: entity });
    }
  } else if (root_is_object) {
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
      let entity_id = w.value[id] || unknowns.next().value;
      if (w.parent_id) {
        if (ctx[w.parent_attr].isInverseLink) {
          facts.push({
            path: w.path,
            fact: [entity_id, w.parent_attr, w.parent_id],
          });
        } else {
          facts.push({
            path: w.path,
            fact: [w.parent_id, w.parent_attr, entity_id],
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
              parent_id: entity_id,
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
              parent_id: entity_id,
              parent_attr: attr,
            });
          }
        } else {
          work.push({
            path: [...w.path, attr],
            value,
            parent_id: entity_id,
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

const encode_facts = function (ctx, raw_facts, facts = [], blobs = []) {
  for (
    const {
      path,
      fact: [entity, attr, value],
    } of raw_facts
  ) {
    const fact = new Uint8Array(TRIBLE_SIZE);
    let encoded_value = V(fact);
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
        encoded_value,
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
      blobs.push([encoded_value, blob]);
    }
  }
  return { facts, blobs };
};

const compile_query = (ctx, raw_facts) => {
  let constants = VALUE_PART;
  const variables = [];
  const facts = [];
  for (
    const {
      path,
      fact: [entity, attr, value],
    } of raw_facts
  ) {
    let encoded_entity;
    let encoded_attr = new Uint8Array(VALUE_SIZE);
    let encoded_value = new Uint8Array(VALUE_SIZE);

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
        encoded_entity = entity;
      } else {
        encoded_entity = new Uint8Array(VALUE_SIZE);
        ctx[id].encoder(entity, encoded_entity);
        constants = constants.put(encoded_entity, () => ({}));
      }
    } catch (error) {
      throw Error(
        `Error encoding entity at [${path.slice(0, -1)}]: ${error.message}`,
      );
    }
    try {
      ctx[id].encoder(ctx[attr].id, encoded_attr);
      constants = constants.put(encoded_attr, () => ({}));
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
        encoded_value = value;
      } else {
        if (ctx[attr].isLink) {
          ctx[id].encoder(value, encoded_value);
        } else {
          ctx[attr].encoder(value, encoded_value);
        }
        constants = constants.put(encoded_value, () => ({}));
      }
    } catch (error) {
      throw Error(`Error encoding value at [${path}]: ${error.message}`);
    }
    facts.push([encoded_entity, encoded_attr, encoded_value]);
  }
  const c = constants.cursor();
  c.push(VALUE_SIZE);
  let bindings = [];
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
    variable_count: bindings.length + variables.length,
    decoders: variables.map(({ decoder }) => decoder),
  };
};

class TribleKB {
  constructor(db = new TribleDB()) {
    this.db = db;
  }
  with(ctx, cfn) {
    let ids = new IDSequence();
    const entities = cfn(ids);
    const raw_facts = entities_to_facts(ctx, ids, entities);
    const { facts, blobs } = encode_facts(ctx, raw_facts);
    const ndb = this.db.with(facts, blobs);
    if (ndb !== this.db) {
      return new TribleKB(ndb, this.types);
    }
    return this;
  }
  *find(ctx, qfn) {
    let vars = new VariableProvider();
    const q = qfn(vars.named());
    const facts = entities_to_facts(ctx, vars, q);
    vars.arrange();

    const { query, bindings, variable_count, decoders } = compile_query(
      ctx,
      facts,
    );

    for (
      let r of new UnsafeQuery(
        query,
        bindings,
        [],
        variable_count,
        variable_count,
        vars.variables.map((v) => v.ascending),
      ).on(this.db)
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
