import { makePART } from "part.js";

const FACT_LENGTH = 64;

const VALUE_LENGTH = 32;

const EAV = 0;
const EVA = 1;
const AEV = 2;
const AVE = 3;
const VEA = 4;
const VAE = 5;
const EXX = 6;
const XXE = 7;
const AXX = 8;
const XXA = 9;
const VXX = 10;
const XXV = 11;
const XXX = 12;

const INDEX_COUNT = 13;

const INDEX_INFIX = new Array(INDEX_COUNT);
INDEX_INFIX[EAV] = [0, 16, 16, 32];
INDEX_INFIX[EVA] = [0, 16, 32, 16];
INDEX_INFIX[AEV] = [0, 16, 16, 32];
INDEX_INFIX[AVE] = [0, 16, 32, 16];
INDEX_INFIX[VEA] = [0, 32, 16, 16];
INDEX_INFIX[VAE] = [0, 32, 16, 16];
INDEX_INFIX[EXX] = [0, 32, 16, 16];
INDEX_INFIX[XXE] = [0, 16, 16];
INDEX_INFIX[AXX] = [0, 16, 16];
INDEX_INFIX[XXA] = [0, 16, 16];
INDEX_INFIX[VXX] = [0, 32, 16];
INDEX_INFIX[XXV] = [0, 16, 32];
INDEX_INFIX[XXX] = [0, 16];

const index_order = new Array(INDEX_COUNT);
index_order[EAV] = (triple) => triple;
index_order[EVA] = (triple) => {
  const index_ordered_key = new Uint8Array(64);
  index_ordered_key.set(E(triple), 0);
  index_ordered_key.set(V(triple), 16);
  index_ordered_key.set(A(triple), 48);
  return index_ordered_key;
};
index_order[AEV] = (triple) => {
  const index_ordered_key = new Uint8Array(64);
  index_ordered_key.set(A(triple), 0);
  index_ordered_key.set(E(triple), 16);
  index_ordered_key.set(V(triple), 32);
  return index_ordered_key;
};
index_order[AVE] = (triple) => {
  const index_ordered_key = new Uint8Array(64);
  index_ordered_key.set(A(triple), 0);
  index_ordered_key.set(V(triple), 16);
  index_ordered_key.set(E(triple), 48);
  return index_ordered_key;
};
index_order[VEA] = (triple) => {
  const index_ordered_key = new Uint8Array(64);
  index_ordered_key.set(V(triple), 0);
  index_ordered_key.set(E(triple), 32);
  index_ordered_key.set(A(triple), 48);
  return index_ordered_key;
};
index_order[VAE] = (triple) => {
  const index_ordered_key = new Uint8Array(64);
  index_ordered_key.set(V(triple), 0);
  index_ordered_key.set(A(triple), 32);
  index_ordered_key.set(E(triple), 48);
  return index_ordered_key;
};
index_order[EXX] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v2 = V2(triple);
  if (!(v1zero(triple) && equal_id(a, v2))) return null;
  const index_ordered_key = new Uint8Array(32);
  index_ordered_key.set(e, 0);
  index_ordered_key.set(a, 16);
  return index_ordered_key;
};
index_order[XXE] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v2 = V2(triple);
  if (!(v1zero(triple) && equal_id(a, v2))) return null;
  const index_ordered_key = new Uint8Array(32);
  index_ordered_key.set(a, 0);
  index_ordered_key.set(e, 16);
  return index_ordered_key;
};
index_order[AXX] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v2 = V2(triple);
  if (!(v1zero(triple) && equal_id(e, v2))) return null;
  const index_ordered_key = new Uint8Array(32);
  index_ordered_key.set(a, 0);
  index_ordered_key.set(e, 16);
  return index_ordered_key;
};
index_order[XXA] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v2 = V2(triple);
  if (!(v1zero(triple) && equal_id(e, v2))) return null;
  const index_ordered_key = new Uint8Array(32);
  index_ordered_key.set(e, 0);
  index_ordered_key.set(a, 16);
  return index_ordered_key;
};
index_order[VXX] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v = V(triple);
  if (equal_id(e, a)) return null;
  const index_ordered_key = new Uint8Array(48);
  index_ordered_key.set(v, 0);
  index_ordered_key.set(e, 32);
  return index_ordered_key;
};
index_order[XXV] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v = V(triple);
  if (equal_id(e, a)) return null;
  const index_ordered_key = new Uint8Array(48);
  index_ordered_key.set(e, 0);
  index_ordered_key.set(v, 16);
  return index_ordered_key;
};
index_order[XXX] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v2 = V2(triple);
  if (!(v1zero(triple) && equal_id(e, a) && equal_id(e, v2))) return null;
  const index_ordered_key = new Uint8Array(32);
  index_ordered_key.set(e, 0);
  return index_ordered_key;
};

const order = ([e, a, v]) => (((e < a) << 0) |
  ((a < v) << 2) |
  ((e < v) << 1) |
  ((e === a) << 3) |
  ((a === v) << 4) |
  ((e === v) << 5));

class ConstantCursor {
  constructor(db, constant) {
    this.constant = constant;
    this.valid = true;
  }

  peek() {
    return this.constant.slice();
  }

  next() {
    this.valid = false;
  }

  seek(value) {
    for (let i = 0; i < VALUE_LENGTH; i++) {
      if (this.constant[i] !== value[i]) {
        if (this.constant[i] < value[i]) this.valid = false;
        return false;
      }
    }
    return true;
  }

  push(ascending = true) {}

  pop() {
    this.valid = true;
  }
}

class ConstantConstraint {
  constructor(variable, constant) {
    this.variable = variable;
    this.constant = constant;
  }

  variables() {
    return [this.variable];
  }

  toCursor(db) {
    return new ConstantCursor(db, this.constant);
  }
}

class IndexCursor {
  constructor(db, index) {
    this.cursor = index.cursor();
    this.valid = this.cursor.valid;
  }

  peek() {
    if (this.valid) {
      return this.cursor.peek();
    }
  }

  next() {
    this.cursor.next();
    this.valid = this.cursor.valid;
  }

  seek(value) {
    const match = this.cursor.seek(value);
    this.valid = this.cursor.valid;
    return match;
  }

  push(ascending) {
    this.cursor.push(VALUE_LENGTH, ascending);
  }

  pop() {
    this.cursor.pop();
    this.valid = this.cursor.valid;
  }
}

class IndexConstraint {
  constructor(variable, index) {
    this.index = index;
    this.variable = variable;
  }

  variables() {
    return [this.variable];
  }

  toCursor(db) {
    return new IndexCursor(db, this.index);
  }
}

class CollectionConstraint {
  constructor(variable, collection) {
    const index_batch = makePART(VALUE_LENGTH).batch();
    for (const c of collection) {
      index_batch.put(c);
    }
    this.index = index_batch.complete();
    this.variable = variable;
  }

  variables() {
    return [this.variable];
  }

  toCursor(db) {
    return new IndexCursor(db, this.index);
  }
}

const order_to_index = new Uint8Array(63);
order_to_index[order([0, 1, 2])] = EAV;
order_to_index[order([0, 2, 1])] = EVA;
order_to_index[order([1, 0, 2])] = AEV;
order_to_index[order([2, 0, 1])] = AVE;
order_to_index[order([1, 2, 0])] = VEA;
order_to_index[order([2, 1, 0])] = VAE;
order_to_index[order([0, 1, 1])] = EXX;
order_to_index[order([1, 0, 0])] = XXE;
order_to_index[order([1, 0, 1])] = AXX;
order_to_index[order([0, 1, 0])] = XXA;
order_to_index[order([1, 1, 0])] = VXX;
order_to_index[order([0, 0, 1])] = XXV;
order_to_index[order([0, 0, 0])] = XXX;

class TripleCursor {
  constructor(db, index) {
    this.index = index;
    this.cursor = db.cursor(index);
    this.valid = this.cursor.valid;
    this.depth = 0;
  }

  peek() {
    if (this.valid) {
      const r = new Uint8Array(VALUE_LENGTH);
      const p = this.cursor.peek();
      for (let i = 0; i < p.length; i++) {
        r[r.length - p.length + i] = p[i];
      }
      return r;
    }
  }

  next() {
    this.cursor.next();
    this.valid = this.cursor.valid;
  }

  seek(value) {
    const len = INDEX_INFIX[this.index][this.depth];
    for (let i = 0; i < VALUE_LENGTH - len; i++) {
      if (value[i] !== 0) {
        this.valid = false;
        return;
      }
    }
    const s = new Uint8Array(len);
    for (let i = 0; i < s.length; i++) {
      s[i] = value[value.length - s.length + i];
    }
    const match = this.cursor.seek(s);
    this.valid = this.cursor.valid;
    return match;
  }

  push(ascending = true) {
    this.depth++;
    this.cursor.push(INDEX_INFIX[this.index][this.depth], ascending);
  }

  pop() {
    this.depth--;
    this.cursor.pop();
    this.valid = this.cursor.valid;
  }
}

class TripleConstraint {
  constructor(triple) {
    this.triple = triple;
    this.index = order_to_index[order(triple)];
  }

  variables() {
    if (
      this.triple[0] === this.triple[1] &&
      this.triple[1] === this.triple[2]
    ) {
      return [this.triple[0]];
    }
    if (this.triple[0] === this.triple[1]) {
      return [this.triple[0], this.triple[2]];
    }
    if (this.triple[1] === this.triple[2]) {
      return [this.triple[0], this.triple[1]];
    }
    return this.triple;
  }

  toCursor(db) {
    return new TripleCursor(db, this.index);
  }
}

class UnsafeQuery {
  constructor(
    pattern,
    prebinding,
    more_constraints,
    variable_count,
    projection_count = variable_count,
    ascending_variables = new Array(variable_count).fill(true),
  ) {
    this.constraints = [
      ...prebinding.map(
        (value, variable) => new ConstantConstraint(variable, value),
      ),
      ...more_constraints,
      ...pattern.map((triple) => new TripleConstraint(triple)),
    ];
    this.variable_count = variable_count;
    this.projection_count = projection_count;
    this.ascending_variables = ascending_variables;
  }
  *on(db) {
    let cursors_at_depth = [...new Array(this.variable_count)].map(() => []);
    for (const constraint of this.constraints) {
      const cursor = constraint.toCursor(db);
      if (!cursor.valid) {
        return;
      }
      for (const variable of constraint.variables()) {
        cursors_at_depth[variable].push(cursor);
      }
    }
    let bindings = new Array(this.variable_count);
    let max_depth = this.variable_count - 1;
    let projection_depth = this.projection_count - 1;
    let depth = 0;
    //init
    let cursors = cursors_at_depth[depth];
    cursors.forEach((c) => c.push(this.ascending_variables[depth]));
    //align / search
    SEARCH:
    while (true) {
      let candidate_origin = 0;
      if (!cursors[candidate_origin].valid) {
        if (depth === 0) {
          return;
        }
        cursors.forEach((c) => c.pop());
        depth--;
        cursors = cursors_at_depth[depth];
        cursors[0].next();
        //Because we popped, we know that we pushed this level,
        //therefore all cursors point to the same value.
        //Which means we can next any of them,
        //including 0 from which the search will continue.

        continue SEARCH;
      }
      let candidate = cursors[candidate_origin].peek();
      let i = candidate_origin;
      while (true) {
        i = (i + 1) % cursors.length;
        if (i === candidate_origin) {
          bindings[depth] = candidate;
          if (depth === max_depth) {
            //peek
            yield [...bindings];
            //next
            for (; projection_depth < depth; depth--) {
              cursors_at_depth[depth].forEach((c) => c.pop());
            }
            cursors = cursors_at_depth[depth];
            cursors[0].next();

            continue SEARCH;
          }
          depth++;
          cursors = cursors_at_depth[depth];
          cursors.forEach((c) => c.push(this.ascending_variables[depth]));

          continue SEARCH;
        }
        const match = cursors[i].seek(candidate);
        if (!cursors[i].valid) {
          if (depth === 0) {
            return;
          }
          cursors.forEach((c) => c.pop());
          depth--;
          cursors = cursors_at_depth[depth];
          cursors[0].next();

          continue SEARCH;
        }
        if (!match) {
          candidate_origin = i;
          candidate = cursors[i].peek();
        }
      }
    }
  }
}

class TribleDB {
  constructor(
    fact_count = 0,
    blobs_count = 0,
    blobs_size = 0,
    indices = new Array(INDEX_COUNT).fill(makePART(FACT_LENGTH)),
    blobs = makePART(VALUE_LENGTH),
  ) {
    this.fact_count = fact_count;
    this.blobs_count = blobs_count;
    this.blobs_size = blobs_size;
    this.indices = indices;
    this.blobs = blobs;
  }

  with(facts, blobs) {
    let fact_count = this.fact_count;
    let blobs_count = this.blobs_count;
    let blobs_size = this.blobs_size;
    let [index, ...rindices] = this.indices;
    let batches = rindices.map((i) => i.batch());
    for (let f = 0; f < facts.length; f++) {
      const fact = facts[f];
      const idx = index.put(fact);
      if (idx === index) {
        continue;
      }
      index = idx;
      for (let i = 1; i < INDEX_COUNT; i++) {
        const reordered_fact = index_order[i](fact);
        if (reordered_fact) {
          batches[i - 1].put(reordered_fact);
        }
      }
      fact_count++;
    }
    let nblobs = this.blobs;
    if (blobs) {
      for (let b = 0; b < blobs.length; b++) {
        const [key, blob] = blobs[b];
        const nnblobs = nblobs.put(key, (b) => (b ? b : blob));
        if (nnblobs !== nblobs) {
          blobs_count++;
          blobs_size += blob.length;
          nblobs = nnblobs;
        }
      }
    }
    if (this.indices[0] === index && this.blobs === nblobs) {
      return this;
    }
    return new TribleDB(
      fact_count,
      blobs_count,
      blobs_size,
      [index, ...batches.map((b) => b.complete())],
      nblobs,
    );
  }

  cursor(index) {
    return this.indices[index].cursor();
  }

  blob(k) {
    return this.blobs.get(k);
  }
}
