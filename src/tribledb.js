import {
  A,
  E,
  equal_id as equalId,
  V,
  v1zero,
  V2,
  VALUE_SIZE,
} from "./trible.js";
import { TRIBLE_PART, VALUE_PART } from "./part.js";

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

const indexOrder = new Array(INDEX_COUNT);
indexOrder[EAV] = (triple) => triple;
indexOrder[EVA] = (triple) => {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(E(triple), 0);
  indexOrderedKey.set(V(triple), 16);
  indexOrderedKey.set(A(triple), 48);
  return indexOrderedKey;
};
indexOrder[AEV] = (triple) => {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(A(triple), 0);
  indexOrderedKey.set(E(triple), 16);
  indexOrderedKey.set(V(triple), 32);
  return indexOrderedKey;
};
indexOrder[AVE] = (triple) => {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(A(triple), 0);
  indexOrderedKey.set(V(triple), 16);
  indexOrderedKey.set(E(triple), 48);
  return indexOrderedKey;
};
indexOrder[VEA] = (triple) => {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(V(triple), 0);
  indexOrderedKey.set(E(triple), 32);
  indexOrderedKey.set(A(triple), 48);
  return indexOrderedKey;
};
indexOrder[VAE] = (triple) => {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(V(triple), 0);
  indexOrderedKey.set(A(triple), 32);
  indexOrderedKey.set(E(triple), 48);
  return indexOrderedKey;
};
indexOrder[EXX] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v2 = V2(triple);
  if (!(v1zero(triple) && equalId(a, v2))) return null;
  const indexOrderedKey = new Uint8Array(32);
  indexOrderedKey.set(e, 0);
  indexOrderedKey.set(a, 16);
  return indexOrderedKey;
};
indexOrder[XXE] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v2 = V2(triple);
  if (!(v1zero(triple) && equalId(a, v2))) return null;
  const indexOrderedKey = new Uint8Array(32);
  indexOrderedKey.set(a, 0);
  indexOrderedKey.set(e, 16);
  return indexOrderedKey;
};
indexOrder[AXX] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v2 = V2(triple);
  if (!(v1zero(triple) && equalId(e, v2))) return null;
  const indexOrderedKey = new Uint8Array(32);
  indexOrderedKey.set(a, 0);
  indexOrderedKey.set(e, 16);
  return indexOrderedKey;
};
indexOrder[XXA] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v2 = V2(triple);
  if (!(v1zero(triple) && equalId(e, v2))) return null;
  const indexOrderedKey = new Uint8Array(32);
  indexOrderedKey.set(e, 0);
  indexOrderedKey.set(a, 16);
  return indexOrderedKey;
};
indexOrder[VXX] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v = V(triple);
  if (equalId(e, a)) return null;
  const indexOrderedKey = new Uint8Array(48);
  indexOrderedKey.set(v, 0);
  indexOrderedKey.set(e, 32);
  return indexOrderedKey;
};
indexOrder[XXV] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v = V(triple);
  if (equalId(e, a)) return null;
  const indexOrderedKey = new Uint8Array(48);
  indexOrderedKey.set(e, 0);
  indexOrderedKey.set(v, 16);
  return indexOrderedKey;
};
indexOrder[XXX] = (triple) => {
  const e = E(triple);
  const a = A(triple);
  const v2 = V2(triple);
  if (!(v1zero(triple) && equalId(e, a) && equalId(e, v2))) return null;
  const indexOrderedKey = new Uint8Array(32);
  indexOrderedKey.set(e, 0);
  return indexOrderedKey;
};

const order = ([e, a, v]) => (((e < a) << 0) |
  ((a < v) << 2) |
  ((e < v) << 1) |
  ((e === a) << 3) |
  ((a === v) << 4) |
  ((e === v) << 5));

class ConstantCursor {
  constructor(constant) {
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
    for (let i = 0; i < VALUE_SIZE; i++) {
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

  toCursor() {
    return new ConstantCursor(this.constant);
  }
}

class IndexCursor {
  constructor(index) {
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
    this.cursor.push(VALUE_SIZE, ascending);
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

  toCursor() {
    return new IndexCursor(this.index);
  }
}

class CollectionConstraint {
  constructor(variable, collection) {
    const indexBatch = VALUE_PART.batch();
    for (const c of collection) {
      indexBatch.put(c);
    }
    this.index = indexBatch.complete();
    this.variable = variable;
  }

  variables() {
    return [this.variable];
  }

  toCursor() {
    return new IndexCursor(this.index);
  }
}

const orderToIndex = new Uint8Array(63);
orderToIndex[order([0, 1, 2])] = EAV;
orderToIndex[order([0, 2, 1])] = EVA;
orderToIndex[order([1, 0, 2])] = AEV;
orderToIndex[order([2, 0, 1])] = AVE;
orderToIndex[order([1, 2, 0])] = VEA;
orderToIndex[order([2, 1, 0])] = VAE;
orderToIndex[order([0, 1, 1])] = EXX;
orderToIndex[order([1, 0, 0])] = XXE;
orderToIndex[order([1, 0, 1])] = AXX;
orderToIndex[order([0, 1, 0])] = XXA;
orderToIndex[order([1, 1, 0])] = VXX;
orderToIndex[order([0, 0, 1])] = XXV;
orderToIndex[order([0, 0, 0])] = XXX;

class TripleCursor {
  constructor(db, index) {
    this.index = index;
    this.cursor = db.cursor(index);
    this.valid = this.cursor.valid;
    this.depth = 0;
  }

  peek() {
    if (this.valid) {
      const r = new Uint8Array(VALUE_SIZE);
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
    for (let i = 0; i < VALUE_SIZE - len; i++) {
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
  constructor(db, triple) {
    this.db = db;
    this.triple = triple;
    this.index = orderToIndex[order(triple)];
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

  toCursor() {
    return new TripleCursor(this.db, this.index);
  }
}

function* unsafeQuery(
  constraints,
  variableCount,
  projectionCount = variableCount,
  ascendingVariables = new Array(variableCount).fill(true),
) {
  const cursorsAtDepth = [...new Array(variableCount)].map(() => []);
  for (const constraint of constraints) {
    const cursor = constraint.toCursor();
    if (!cursor.valid) {
      return;
    }
    for (const variable of constraint.variables()) {
      cursorsAtDepth[variable].push(cursor);
    }
  }
  const bindings = new Array(variableCount);
  const maxDepth = variableCount - 1;
  const projectionDepth = projectionCount - 1;
  let depth = 0;
  //init
  let cursors = cursorsAtDepth[depth];
  cursors.forEach((c) => c.push(ascendingVariables[depth]));
  //align / search
  SEARCH:
  while (true) {
    let candidateOrigin = 0;
    if (!cursors[candidateOrigin].valid) {
      if (depth === 0) {
        return;
      }
      cursors.forEach((c) => c.pop());
      depth--;
      cursors = cursorsAtDepth[depth];
      cursors[0].next();
      //Because we popped, we know that we pushed this level,
      //therefore all cursors point to the same value.
      //Which means we can next any of them,
      //including 0 from which the search will continue.

      continue SEARCH;
    }
    let candidate = cursors[candidateOrigin].peek();
    let i = candidateOrigin;
    while (true) {
      i = (i + 1) % cursors.length;
      if (i === candidateOrigin) {
        bindings[depth] = candidate;
        if (depth === maxDepth) {
          //peek
          yield [...bindings];
          //next
          for (; projectionDepth < depth; depth--) {
            cursorsAtDepth[depth].forEach((c) => c.pop());
          }
          cursors = cursorsAtDepth[depth];
          cursors[0].next();

          continue SEARCH;
        }
        depth++;
        cursors = cursorsAtDepth[depth];
        cursors.forEach((c) => c.push(ascendingVariables[depth]));

        continue SEARCH;
      }
      const match = cursors[i].seek(candidate);
      if (!cursors[i].valid) {
        if (depth === 0) {
          return;
        }
        cursors.forEach((c) => c.pop());
        depth--;
        cursors = cursorsAtDepth[depth];
        cursors[0].next();

        continue SEARCH;
      }
      if (!match) {
        candidateOrigin = i;
        candidate = cursors[i].peek();
      }
    }
  }
}

class TribleDB {
  constructor(
    indices = new Array(INDEX_COUNT).fill(TRIBLE_PART),
    blobs = VALUE_PART,
    tribleCount = 0,
    blobsCount = 0,
    blobsSize = 0,
  ) {
    this.tribleCount = tribleCount;
    this.blobsCount = blobsCount;
    this.blobsSize = blobsSize;
    this.indices = indices;
    this.blobs = blobs;
  }

  with(tribles, blobs) {
    let tribleCount = this.tribleCount;
    let blobsCount = this.blobsCount;
    let blobsSize = this.blobsSize;
    let [index, ...rindices] = this.indices;
    const batches = rindices.map((i) => i.batch());
    for (let f = 0; f < tribles.length; f++) {
      const trible = tribles[f];
      const idx = index.put(trible);
      if (idx === index) {
        continue;
      }
      index = idx;
      for (let i = 1; i < INDEX_COUNT; i++) {
        const reorderedTrible = indexOrder[i](trible);
        if (reorderedTrible) {
          batches[i - 1].put(reorderedTrible);
        }
      }
      tribleCount++;
    }
    let nblobs = this.blobs;
    if (blobs) {
      for (let b = 0; b < blobs.length; b++) {
        const [key, blob] = blobs[b];
        const nnblobs = nblobs.put(key, (b) => (b ? b : blob));
        if (nnblobs !== nblobs) {
          blobsCount++;
          blobsSize += blob.length;
          nblobs = nnblobs;
        }
      }
    }
    if (this.indices[0] === index && this.blobs === nblobs) {
      return this;
    }
    return new TribleDB(
      [index, ...batches.map((b) => b.complete())],
      nblobs,
      tribleCount,
      blobsCount,
      blobsSize,
    );
  }

  cursor(index) {
    return this.indices[index].cursor();
  }

  blob(k) {
    return this.blobs.get(k);
  }
}

export {
  CollectionConstraint,
  ConstantConstraint,
  IndexConstraint,
  TribleDB,
  TripleConstraint,
  unsafeQuery,
};
