import {
  AEVOrder,
  AVEOrder,
  EAVOrder,
  EVAOrder,
  ID_SIZE,
  TRIBLE_SIZE,
  tribleSegment,
  VAEOrder,
  VALUE_SIZE,
  VEAOrder,
} from "./trible.js";
import { hash_combine, hash_digest, hash_equal, hash_update } from "./wasm.js";
import { ByteBitset } from "./bitset.js";

// Perstistent Adaptive Trie with Cuckoos and Hashes (PATCH)
export const Entry = class {
  constructor(key, value) {
    this.leaf = new Leaf(key, value);
    this.hash = hash_digest(key);
  }
};

function batch() {
  return {};
}

function _union(
  leftNode,
  rightNode,
  depth = 0,
  key = new Uint8Array(KEY_LENGTH),
) {
  if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
    return leftNode;
  }
  const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
  for (; depth < maxDepth; depth++) {
    const leftByte = leftNode.peek(depth);
    if (leftByte !== rightNode.peek(depth)) break;
    key[depth] = leftByte;
  }
  if (depth === KEY_LENGTH) return leftNode;

  const unionChildbits = new ByteBitset();
  const leftChildbits = new ByteBitset();
  const rightChildbits = new ByteBitset();
  const intersectChildbits = new ByteBitset();
  const children = [];
  let hash = new Uint8Array(16);
  let count = 0;
  let segmentCount = 0;

  leftNode.propose(depth, leftChildbits);
  rightNode.propose(depth, rightChildbits);

  unionChildbits.setUnion(leftChildbits, rightChildbits);
  intersectChildbits.setIntersection(leftChildbits, rightChildbits);
  leftChildbits.setSubtraction(leftChildbits, intersectChildbits);
  rightChildbits.setSubtraction(rightChildbits, intersectChildbits);

  for (let index of leftChildbits.entries()) {
    const child = leftNode.get(depth, index);
    children[index] = child;
    hash = hash_combine(hash, child.hash);
    count += child.count();
    segmentCount += child.segmentCount(depth);
  }

  for (let index of rightChildbits.entries()) {
    const child = rightNode.get(depth, index);

    children[index] = child;
    hash = hash_combine(hash, child.hash);
    count += child.count();
    segmentCount += child.segmentCount(depth);
  }

  for (let index of intersectChildbits.entries()) {
    key[depth] = index;
    const leftChild = leftNode.get(depth, index);
    const rightChild = rightNode.get(depth, index);

    const union = _union(leftChild, rightChild, depth + 1, key);
    children[index] = union;
    hash = hash_combine(hash, union.hash);
    count += union.count();
    segmentCount += union.segmentCount(depth);
  }

  return new Branch(
    key.slice(),
    depth,
    unionChildbits,
    children,
    hash,
    count,
    segmentCount,
    {},
  );
}

function _subtract(
  leftNode,
  rightNode,
  depth = 0,
  key = new Uint8Array(KEY_LENGTH),
) {
  if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
    return undefined;
  }
  const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
  for (; depth < maxDepth; depth++) {
    const leftByte = leftNode.peek(depth);
    if (leftByte !== rightNode.peek(depth)) {
      return leftNode;
    }
    key[depth] = leftByte;
  }
  if (depth === KEY_LENGTH) return undefined;

  const leftChildbits = new ByteBitset();
  const rightChildbits = new ByteBitset();
  const intersectChildbits = new ByteBitset();
  const children = [];
  let hash = new Uint8Array(16);
  let count = 0;
  let segmentCount = 0;

  leftNode.propose(depth, leftChildbits);
  rightNode.propose(depth, rightChildbits);

  intersectChildbits.setIntersection(leftChildbits, rightChildbits);
  leftChildbits.setSubtraction(leftChildbits, intersectChildbits);

  for (let index of leftChildbits.entries()) {
    const child = leftNode.get(depth, index);
    children[index] = child;
    hash = hash_combine(hash, child.hash);
    count += child.count();
    segmentCount += child.segmentCount(depth);
  }

  for (let index of intersectChildbits.entries()) {
    const leftChild = leftNode.get(depth, index);
    const rightChild = rightNode.get(depth, index);

    key[depth] = index;
    const diff = _subtract(leftChild, rightChild, depth + 1);
    if (diff) {
      leftChildbits.set(index);
      children[index] = diff;
      hash = hash_combine(hash, diff.hash);
      count += diff.count();
      segmentCount += diff.segmentCount(depth);
    }
  }
  if (leftChildbits.isEmpty()) return undefined;
  return new Branch(
    key.slice(),
    depth,
    leftChildbits,
    children,
    hash,
    count,
    segmentCount,
    {},
  );
}

function _intersect(
  leftNode,
  rightNode,
  depth = 0,
  key = new Uint8Array(KEY_LENGTH),
) {
  if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
    return leftNode;
  }
  const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
  for (; depth < maxDepth; depth++) {
    const leftByte = leftNode.peek(depth);
    if (leftByte !== rightNode.peek(depth)) return undefined;
    key[depth] = leftByte;
  }
  if (depth === KEY_LENGTH) return leftNode;

  const leftChildbits = new ByteBitset();
  const rightChildbits = new ByteBitset();
  const intersectChildbits = new ByteBitset();
  const children = [];
  let hash = new Uint8Array(16);
  let count = 0;
  let segmentCount = 0;

  leftNode.propose(depth, leftChildbits);
  rightNode.propose(depth, rightChildbits);

  intersectChildbits.setIntersection(leftChildbits, rightChildbits);

  for (let index of intersectChildbits.entries()) {
    const leftChild = leftNode.get(depth, index);
    const rightChild = rightNode.get(depth, index);

    key[depth] = index;
    const intersection = _intersect(leftChild, rightChild, depth + 1);
    if (intersection) {
      intersectChildbits.unset(index);
    } else {
      children[index] = intersection;
      hash = hash_combine(hash, intersection.hash);
      count += intersection.count();
      segmentCount += intersection.segmentCount(depth);
    }
  }
  if (intersectChildbits.isEmpty()) return undefined;

  return new Branch(
    key.slice(),
    depth,
    intersectChildbits,
    children,
    hash,
    count,
    segmentCount,
    {},
  );
}

function _difference(
  leftNode,
  rightNode,
  depth = 0,
  key = new Uint8Array(KEY_LENGTH),
) {
  if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
    return undefined;
  }
  const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
  for (; depth < maxDepth; depth++) {
    const leftByte = leftNode.peek(depth);
    if (leftByte !== rightNode.peek(depth)) break;
    key[depth] = leftByte;
  }
  if (depth === KEY_LENGTH) return undefined;

  const leftChildbits = (new ByteBitset()).setAll();
  const rightChildbits = (new ByteBitset()).setAll();
  const intersectChildbits = (new ByteBitset()).unsetAll();
  const diffChildbits = (new ByteBitset()).unsetAll();

  const children = [];
  let hash = new Uint8Array(16);
  let count = 0;
  let segmentCount = 0;

  leftNode.propose(depth, leftChildbits);
  rightNode.propose(depth, rightChildbits);

  intersectChildbits.setIntersection(leftChildbits, rightChildbits);
  leftChildbits.setSubtraction(leftChildbits, intersectChildbits);
  rightChildbits.setSubtraction(rightChildbits, intersectChildbits);
  diffChildbits.setDifference(leftChildbits, rightChildbits);

  for (let index of leftChildbits.entries()) {
    const child = leftNode.get(depth, index);
    children[index] = child;
    hash = hash_combine(hash, child.hash);
    count += child.count();
    segmentCount += child.segmentCount(depth);
  }

  for (let index of rightChildbits.entries()) {
    const child = rightNode.get(depth, index);
    children[index] = child;
    hash = hash_combine(hash, child.hash);
    count += child.count();
    segmentCount += child.segmentCount(depth);
  }

  for (let index of intersectChildbits.entries()) {
    const leftChild = leftNode.get(depth, index);
    const rightChild = rightNode.get(depth, index);

    key[depth] = index;
    const difference = _difference(leftChild, rightChild, depth + 1);
    if (difference) {
      diffChildbits.set(index);
      children[index] = difference;
      hash = hash_combine(hash, difference.hash);
      count += difference.count();
      segmentCount += difference.segmentCount(depth);
    }
  }
  if (diffChildbits.isEmpty()) return undefined;

  return new Branch(
    key.slice(),
    depth,
    diffChildbits,
    children,
    hash,
    count,
    segmentCount,
    {},
  );
}

function _isSubsetOf(leftNode, rightNode, depth = 0) {
  if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
    return true;
  }
  const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
  for (; depth < maxDepth; depth++) {
    if (leftNode.peek(depth) !== rightNode.peek(depth)) break;
  }
  if (depth === KEY_LENGTH) return true;

  const leftChildbits = (new ByteBitset()).setAll();
  const rightChildbits = (new ByteBitset()).setAll();
  const intersectChildbits = (new ByteBitset()).unsetAll();

  leftNode.propose(depth, leftChildbits);
  rightNode.propose(depth, rightChildbits);

  intersectChildbits.setIntersection(leftChildbits, rightChildbits);
  leftChildbits.setSubtraction(leftChildbits, intersectChildbits);

  if (!leftChildbits.isEmpty()) return false;

  for (let index of intersectChildbits.entries()) {
    const leftChild = leftNode.get(depth, index);
    const rightChild = rightNode.get(depth, index);
    if (!_isSubsetOf(leftChild, rightChild, depth + 1)) {
      return false;
    }
  }
  return true;
}

function _isIntersecting(leftNode, rightNode, depth = 0) {
  if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
    return true;
  }
  const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
  for (; depth < maxDepth; depth++) {
    if (leftNode.peek(depth) !== rightNode.peek(depth)) {
      return false;
    }
  }
  if (depth === KEY_LENGTH) return true;

  const leftChildbits = new ByteBitset();
  const rightChildbits = new ByteBitset();
  const intersectChildbits = new ByteBitset();

  leftNode.propose(depth, leftChildbits);
  rightNode.propose(depth, rightChildbits);

  intersectChildbits.setIntersection(leftChildbits, rightChildbits);

  for (let index of intersectChildbits.entries()) {
    const leftChild = leftNode.get(depth, index);
    const rightChild = rightNode.get(depth, index);
    if (_isIntersecting(leftChild, rightChild, depth + 1)) {
      return true;
    }
  }

  return false;
}

function* _find(
  node,
  key = new Uint8Array(KEY_LENGTH),
  start = 0,
  end = KEY_LENGTH,
) {
  let node = node;
  for (let depth = start; depth < end && node; depth++) {
    const sought = key[depth];
    node = node.get(depth, sought);
  }
  return undefined;
}

function* _walk(
  node,
  key = new Uint8Array(KEY_LENGTH),
  start = 0,
  end = KEY_LENGTH,
) {
  let depth = start;
  for (; depth < node.branchDepth && depth < end; depth++) {
    key[depth] = node.peek(depth);
  }
  if (depth === end) {
    yield [key, node];
  } else {
    for (let index of node.childbits.entries()) {
      key[depth] = index;
      const child = node.get(depth, index);
      yield* _walk(child, key, depth + 1, end);
    }
  }
}

const Leaf = class {
  constructor(key, value) {
    this.key = key.slice(depth);
    this.value = value;
  }

  count() {
    return 1;
  }

  peek(order, depth) {
    return this.key[order(depth)];
  }

  propose(order, depth, bitset) {
    bitset.unsetAll();
    bitset.set(this.key[order(depth)]);
  }

  get(order, depth, v) {
    if (depth < this.key.length && this.key[order(depth)] === v) return this;
    return undefined;
  }

  hash() {
    return hash_digest(this.key);
  }

  put(order, _segment, batch, entry, at_depth) {
    let depth = at_depth;
    for (; depth < this.key.length; depth++) {
      let key_depth = order(depth);
      const own_key = this.key[key_depth];
      const entry_key = entry.leaf.key[key_depth];
      if (own_key !== entry_key) {
        const branchChildren = [];
        branchChildren[own_key] = this;
        branchChildren[entry_key] = entry.leaf;
        const hash = hash_combine(this.hash(), entry.hash);

        return new Branch(
          batch,
          depth,
          branchChildren,
          this,
          hash,
          2,
          2,
        );
      }
    }
  }

  segmentCount(_order, _segment, _at_depth) {
    return 1;
  }

  prefixSegmentCount(order, key, start_depth, at_depth) {
    for (let depth = at_depth; depth < start_depth; depth++) {
      let key_depth = order(depth);
      if (this.key[key_depth] != key[key_depth]) {
        return 0;
      }
    }
    return 1;
  }

  infixes(order, key, tree_start_depth, _tree_end_depth, fn, out, at_depth) {
    for (let depth = at_depth; depth < tree_start_depth; depth++) {
      let key_depth = order(depth);
      if (this.key[key_depth] != key[key_depth]) {
        return;
      }
    }
    out.push(fn(this.key));
  }

  has_prefix(order, key, end_depth) {
    for (let depth = at_depth; depth <= end_depth; depth++) {
      let key_depth = order(depth);
      if (this.key[key_depth] != key[key_depth]) {
        return false;
      }
    }
    return true;
  }
};

const Branch = class {
  constructor(
    batch,
    branchDepth,
    children,
    leaf,
    hash,
    count,
    segmentCount,
  ) {
    this.batch = batch;
    this.branchDepth = branchDepth;
    this.children = children;
    this.leaf = leaf;
    this.hash = hash;
    this._count = count;
    this._segmentCount = segmentCount;
  }

  count() {
    return this._count;
  }

  peek(order, at_depth) {
    if (at_depth < this.branchDepth) {
      return this.key[order(at_depth)];
    } else {
      return undefined;
    }
  }

  propose(order, at_depth, bitset) {
    bitset.unsetAll();
    if (at_depth < this.branchDepth) {
      bitset.set(this.key[order(at_depth)]);
    } else {
      this.children.forEach((_, index) => {
        bitset.set(index);
      });
    }
  }

  get(order, at_depth, v) {
    if (at_depth === this.branchDepth) {
      return this.children[v];
    } else {
      if (this.key[order(at_depth)] === v) return this;
    }
    return undefined;
  }

  put(order, segment, batch, entry, at_depth) {
    let depth = at_depth;
    for (; depth < this.branchDepth; depth++) {
      const key_order = order(depth);
      const this_key = this.leaf.key[key_order];
      const entry_key = entry.leaf.key[key_order];
      if (this_key !== entry_key) {
        const nchildren = [];
        nchildren[this_key] = this;
        nchildren[entry_key] = entry.leaf;
        const count = this._count + 1;
        const segmentCount = this.segmentCount(order, segment, depth) + 1;
        const hash = hash_combine(this.hash, entry.hash);

        return new Branch(
          batch,
          depth,
          nchildren,
          hash,
          count,
          segmentCount,
        );
      }
    }

    const entry_key = entry.leaf.key[order(this.branchDepth)];
    let nchild;
    let hash;
    let count;
    let segmentCount;

    const child = this.children[entry_key];
    if (child) {
      //We need to update the child where this key would belong.
      const oldChildHash = child.hash;
      const oldChildCount = child.count();
      const oldChildSegmentCount = child.segmentCount(this.branchDepth);
      nchild = child.put(order, segment, batch, entry, this.branchDepth);
      if (!nchild) return undefined;
      hash = hash_update(this.hash, oldChildHash, nchild.hash);
      count = this._count - oldChildCount + nchild.count();
      segmentCount = this._segmentCount -
        oldChildSegmentCount +
        nchild.segmentCount(this.branchDepth);
    } else {
      nchild = entry.leaf;
      hash = hash_combine(this.hash, entry.hash);
      count = this._count + 1;
      segmentCount = this._segmentCount + 1;
    }

    if (this.batch === batch) {
      this.children[entry_key] = nchild;
      this.hash = hash;
      this._count = count;
      this._segmentCount = segmentCount;
      return this;
    }

    const nchildren = this.children.slice();
    nchildren[entry_key] = nchild;
    return new Branch(
      batch,
      this.branchDepth,
      nchildren,
      this.leaf,
      hash,
      count,
      segmentCount,
    );
  }

  segmentCount(order, segment, at_depth) {
    // Because a pact might compress an entire segment within a node below it,
    // we need to make sure that our current node is actually inside that
    // segment and not in a segment below it.
    if (segment(order(at_depth)) === segment(order(this.branchDepth))) {
      return this._segmentCount;
    } else {
      return 1;
    }
  }

  prefixSegmentCount(
    order,
    segment,
    key,
    key_start_depth,
    tree_start_depth,
    at_depth,
  ) {
    for (let depth = at_depth; depth < this.branchDepth; depth++) {
      if (tree_start_depth <= depth) {
        if (segment(key_start_depth) != segment(order(this.branchDepth))) {
          return 1;
        } else {
          return this._segmentCount;
        }
      }
      const key_depth = order(depth);
      if (this.leaf.key[key_depth] != key[key_depth]) {
        return 0;
      }
    }
    const child = this.children[key[order(this.branchDepth)]];
    if (child) {
      return child.prefixSegmentCount(
        order,
        segment,
        key,
        key_start_depth,
        tree_start_depth,
        this.branchDepth,
      );
    }
    return 0;
  }

  infixes(order, key, tree_start_depth, tree_end_depth, fn, out, at_depth) {
    for (
      let depth = at_depth;
      depth < Math.min(tree_start_depth, this.branchDepth);
      depth++
    ) {
      let key_depth = order(depth);
      if (this.leaf.key[key_depth] != key[key_depth]) {
        return;
      }
    }
    if (tree_end_depth < this.branchDepth) {
      out.push(fn(this.tree.key));
      return;
    }
    if (tree_start_depth > this.branchDepth) {
      const child = this.children[key[order(this.branchDepth)]];
      if (child) {
        child.infix(
          order,
          key,
          tree_start_depth,
          tree_end_depth,
          fn,
          out,
          this.branchDepth,
        );
      }
      return;
    }
    this.children.forEach((child) =>
      child.infixes(
        order,
        key,
        tree_start_depth,
        tree_end_depth,
        fn,
        out,
        this.branchDepth,
      )
    );
  }

  has_prefix(order, key, end_depth, at_depth) {
    for (
      let depth = at_depth;
      depth < Math.min(end_depth, this.branchDepth);
      depth++
    ) {
      let key_depth = order(depth);
      if (this.leaf.key[key_depth] != key[key_depth]) {
        return false;
      }
    }
    if (end_depth < this.branchDepth) {
      return true;
    }

    const child = this.children[key[order(this.branchDepth)]];
    if (child) {
      return child.has_prefix(
        order,
        key,
        end_depth,
        this.branchDepth,
      );
    }
    return false;
  }
};

const PATCH = class {
  constructor(keyLength, order, segments, child) {
    this.keyLength = keyLength;
    this.order = order, this.segments = segments, this.child = child;
    this.segments = segments;
  }
  count() {
    if (this.child) return this.child.count();
    return 0;
  }

  put(batch, entry) {
    if (this.child) {
      const nchild = this.child.put(
        this.order.treeToKey,
        this.segment,
        batch,
        entry,
        0,
      );
      if (this.child === nchild) return this;
      return new PATCH(this.keyLength, this.order, this.segments, nchild);
    }
    return new PATCH(this.keyLength, this.order, this.segments, entry.leaf);
  }

  get(key) {
    _find(this.child, key)?.value;
  }

  has(key) {
    Boolean(_find(this.child, key));
  }

  segmentCount(key, start_depth) {
    this.child.segmentCount(key, start_depth, 0);
  }

  infixes(
    key = new Uint8Array(this.keyLength),
    start = 0,
    end = this.keyLength,
  ) {
    const out = [];
    this.child.infixes(
      this.order.treeToKey,
      key,
      this.order.keyToTree(start),
      this.order.keyToTree(end),
      fn,
      out,
      0,
    );
    return out;
  }

  has_prefix(key = new Uint8Array(KEY_LENGTH), end = KEY_LENGTH) {
    return this.child.has_prefix(key, end);
  }

  *entries() {
    if (this.child) {
      for (const [k, n] of _walk(this.child)) {
        yield [k.slice(), n.value];
      }
    }
  }

  *keys() {
    if (this.child) {
      for (const [k, _] of _walk(this.child)) {
        yield k.slice();
      }
    }
  }

  *values() {
    if (this.child) {
      for (const [_, n] of _walk(this.child)) {
        yield n.value;
      }
    }
  }

  isEmpty() {
    return !this.child;
  }

  isEqual(other) {
    return (
      this.child === other.child ||
      (this.keyLength === other.keyLength &&
        !!this.child &&
        !!other.child &&
        hash_equal(this.child.hash, other.child.hash))
    );
  }

  isSubsetOf(other) {
    return (
      this.keyLength === other.keyLength &&
      (!this.child || (!!other.child && _isSubsetOf(this.child, other.child)))
    );
  }

  // Note that the empty set has no intersection with itself.
  isIntersecting(other) {
    return (
      this.keyLength === other.keyLength &&
      !!this.child &&
      !!other.child &&
      (this.child === other.child ||
        hash_equal(this.child.hash, other.child.hash) ||
        _isIntersecting(this.child, other.child))
    );
  }

  union(other) {
    if (!this.child) {
      return new Tree(other.child);
    }
    if (!other.child) {
      return new Tree(this.child);
    }
    return new Tree(_union(this.child, other.child));
  }

  subtract(other) {
    if (!other.child) {
      return new Tree(this.child);
    }
    if (
      !this.child ||
      hash_equal(this.child.hash, other.child.hash)
    ) {
      return new Tree();
    } else {
      return new Tree(_subtract(this.child, other.child));
    }
  }

  intersect(other) {
    if (!this.child || !other.child) {
      return new Tree(null);
    }
    if (
      this.child === other.child ||
      hash_equal(this.child.hash, other.child.hash)
    ) {
      return new Tree(this.child);
    }
    return new Tree(_intersect(this.child, other.child));
  }

  difference(other) {
    if (!this.child) {
      return new Tree(other.child);
    }
    if (!other.child) {
      return new Tree(this.child);
    }
    if (
      this.child === other.child ||
      hash_equal(this.child.hash, other.child.hash)
    ) {
      return new Tree(null);
    }
    return new Tree(_difference(this.child, other.child));
  }
};

function singleSegment(at_depth) {
  return 0;
}

const naturalOrder = {
  treeToKey: (at_depth) => at_depth,
  keyToTree: (at_depth) => at_depth,
};

const emptyEAVTriblePact = new PATCH(TRIBLE_SIZE, EAVOrder, tribleSegment);
const emptyEVATriblePact = new PATCH(TRIBLE_SIZE, EVAOrder, tribleSegment);
const emptyAEVTriblePact = new PATCH(TRIBLE_SIZE, AEVOrder, tribleSegment);
const emptyAVETriblePact = new PATCH(TRIBLE_SIZE, AVEOrder, tribleSegment);
const emptyVEATriblePact = new PATCH(TRIBLE_SIZE, VEAOrder, tribleSegment);
const emptyVAETriblePact = new PATCH(TRIBLE_SIZE, VAEOrder, tribleSegment);

const emptyIdPATCH = new PATCH(ID_SIZE, naturalOrder, singleSegment);
const emptyValuePATCH = new PATCH(VALUE_SIZE, naturalOrder, singleSegment);

export {
  emptyIdIdValueTriblePACT,
  emptyIdPATCH,
  emptyIdValueIdTriblePACT,
  emptyTriblePACT,
  emptyValueIdIdTriblePACT,
  emptyValuePATCH,
};
