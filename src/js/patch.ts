import {
  AEVOrder,
  AVEOrder,
  EAVOrder,
  EVAOrder,
  ID_SIZE,
  TRIBLE_SIZE,
  TribleSegmentation,
  VAEOrder,
  VALUE_SIZE,
  VEAOrder,
} from "./trible.js";
import { hash_combine, hash_digest, hash_equal, hash_update } from "./wasm.js";
import { ByteBitset } from "./bitset.js";

type FixedUint8Array<L extends number> = Uint8Array & {length: L};

function fixedUint8Array<L extends number>(length: L): FixedUint8Array<L> {
  return new Uint8Array(length) as FixedUint8Array<L>;
}

type Hash = FixedUint8Array<16>;

// Perstistent Adaptive Trie with Cuckoos and Hashes (PATCH)
export class Entry<L extends number, Value> {
  leaf: Leaf<L, Value>;
  hash: Hash;

  constructor(key: FixedUint8Array<L>, value: Value) {
    this.leaf = new Leaf(key, value);
    this.hash = hash_digest(key) as Hash;
  }
};

function batch() {
  return {};
}

type Batch = object;

type ChildTable<L extends number, Value> = Node<L, Value>[];

function _union<L extends number, Value>(
  keyLength: L,
  order: Ordering<L>,
  segments: Segmentation<L>,
  batch: Batch,
  leftNode: Node<L, Value>,
  rightNode: Node<L, Value>,
  depth: number = 0
): Node<L, Value> {
  if (hash_equal(leftNode.hash(), rightNode.hash()) || depth === keyLength) {
    return leftNode;
  }
  const branchDepth = Math.min(leftNode.branchDepth(keyLength), rightNode.branchDepth(keyLength));
  for (; depth < branchDepth; depth++) {
    const leftByte = leftNode.peek(order, depth);
    const rightByte = rightNode.peek(order, depth);

    if (leftByte !== rightByte) {
      const children: ChildTable<L, Value> = [];
      children[leftByte] = leftNode;
      children[rightByte] = rightNode;

      const hash = hash_combine(leftNode.hash(), rightNode.hash()) as Hash;
      const count = leftNode.count()
                + rightNode.count();
      const segmentCount = leftNode.segmentCount(order, segments, depth)
                       + rightNode.segmentCount(order, segments, depth);
      const leaf = leftNode.leaf();

      return new Branch(
        batch,
        depth,
        children,
        leaf,
        hash,
        count,
        segmentCount,
      )
    };
  }
  
  if (depth === keyLength) return leftNode;

  const children: ChildTable<L, Value> = [];
  let hash = fixedUint8Array(16);
  let count = 0;
  let segmentCount = 0;

  leftNode.eachChild((child, index) => {
    children[index] = child;
  });

  rightNode.eachChild((child, index) => {
    if(index in children) {
      children[index] = _union(keyLength, order, segments, batch, children[index], child, branchDepth);
    } else {
      children[index] = child;
    }
  });

  children.forEach(child => {
    hash = hash_combine(hash, child.hash()) as Hash;
    count += child.count();
    segmentCount += child.segmentCount(order, segments, depth);
  });

  const leaf = (children.find(() => true) as Node<L, Value>).leaf();

  return new Branch(
    batch,
    depth,
    children,
    leaf,
    hash,
    count,
    segmentCount,
  );
}

function _subtract<L extends number, Value>(
  keyLength: L,
  order: Ordering<L>,
  segments: Segmentation<L>,
  batch: Batch,
  leftNode: Node<L, Value>,
  rightNode: Node<L, Value>,
  depth: number = 0
): Node<L, Value> | undefined {
  if (hash_equal(leftNode.hash(), rightNode.hash()) || depth === keyLength) {
    return leftNode;
  }
  const branchDepth = Math.min(leftNode.branchDepth(keyLength), rightNode.branchDepth(keyLength));
  for (; depth < branchDepth; depth++) {
    const leftByte = leftNode.peek(order, depth);
    const rightByte = rightNode.peek(order, depth);

    if (leftByte !== rightByte) {
      return leftNode;
    };
  }

  if (depth === keyLength) return leftNode;

  const children: ChildTable<L, Value> = [];
  let hash = fixedUint8Array(16);
  let count = 0;
  let segmentCount = 0;

  leftNode.eachChild((child, index) => {
    children[index] = child;
  });

  rightNode.eachChild((child, index) => {
    if(index in children) {
      const newChild = _subtract(keyLength, order, segments, batch, children[index], child, branchDepth);
      if(newChild === undefined) {
        delete children[index];
      } else {
        children[index] = newChild;
      }
    }
  });

  if(children.length === 0) {
    return undefined;
  }

  const leaf = (children.find(() => true) as Node<L, Value>).leaf();

  if(children.length === 1) {
    return leaf;
  }

  children.forEach(child => {
    hash = hash_combine(hash, child.hash()) as Hash;
    count += child.count();
    segmentCount += child.segmentCount(order, segments, depth);
  });

  return new Branch(
    batch,
    depth,
    children,
    leaf,
    hash,
    count,
    segmentCount,
  );
}

function _intersect<L extends number, Value>(
  keyLength: L,
  order: Ordering<L>,
  segments: Segmentation<L>,
  batch: Batch,
  leftNode: Node<L, Value>,
  rightNode: Node<L, Value>,
  depth: number = 0
): Node<L, Value> | undefined {
  if (hash_equal(leftNode.hash(), rightNode.hash()) || depth === keyLength) {
    return leftNode;
  }
  const branchDepth = Math.min(leftNode.branchDepth(keyLength), rightNode.branchDepth(keyLength));
  for (; depth < branchDepth; depth++) {
    const leftByte = leftNode.peek(order, depth);
    const rightByte = rightNode.peek(order, depth);

    if (leftByte !== rightByte) {
      return undefined;
    };
  }
  
  if (depth === keyLength) return leftNode;

  const children: ChildTable<L, Value> = [];
  let hash = fixedUint8Array(16);
  let count = 0;
  let segmentCount = 0;

  const left_children: ChildTable<L, Value> = [];
  leftNode.eachChild((child, index) => {
    left_children[index] = child;
  });

  rightNode.eachChild((child, index) => {
    if(index in left_children) {
      children[index] = _union(keyLength, order, segments, batch, left_children[index], child, branchDepth);
    }
  });

  if(children.length === 0) {
    return undefined;
  }

  const leaf = (children.find(() => true) as Node<L, Value>).leaf();

  if(children.length === 1) {
    return leaf;
  }

  children.forEach(child => {
    hash = hash_combine(hash, child.hash()) as Hash;
    count += child.count();
    segmentCount += child.segmentCount(order, segments, depth);
  });

  return new Branch(
    batch,
    depth,
    children,
    leaf,
    hash,
    count,
    segmentCount,
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
  const maxDepth = Math.min(leftNode.branchDepth(), rightNode.branchDepth());
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
  const maxDepth = Math.min(leftNode.branchDepth(), rightNode.branchDepth());
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
  const maxDepth = Math.min(leftNode.branchDepth(), rightNode.branchDepth());
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
  for (; depth < node.branchDepth() && depth < end; depth++) {
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

class Leaf<L extends number, Value> implements Node<L, Value>{
  key: FixedUint8Array<L>;
  value: Value;

  constructor(key: FixedUint8Array<L>, value: Value) {
    this.key = key;
    this.value = value;
  }

  count() {
    return 1;
  }

  branchDepth(keyLength: L): number {
    return keyLength;
  }

  peek(order: Ordering<L>, depth: number) {
    return this.key[order.treeToKey(depth)];
  }

  eachChild(f: (child: Node<L, Value>, index: number) => void):void {
    return;
  }

  branch(v: number): Node<L, Value> | undefined {
    return undefined;
  }

  hash(): Hash {
    return hash_digest(this.key) as Hash;
  }

  leaf(): Leaf<L, Value> {
    return this;
  }

  put(order: Ordering<L>, _segment: Segmentation<L>, batch: Batch, entry: Entry<L, Value>, at_depth: number): Node<L, Value> | undefined {
    let depth = at_depth;
    for (; depth < this.key.length; depth++) {
      let key_depth = order.treeToKey(depth);
      const own_key = this.key[key_depth];
      const entry_key = entry.leaf.key[key_depth];
      if (own_key !== entry_key) {
        const branchChildren: Node<L, Value>[] = [];
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

  segmentCount(_order: Ordering<L>, _segment: Segmentation<L>, _at_depth: number): number {
    return 1;
  }

  prefixSegmentCount(order: Ordering<L>, key: FixedUint8Array<L>, start_depth: number, at_depth: number) {
    for (let depth = at_depth; depth < start_depth; depth++) {
      let key_depth = order.treeToKey(depth);
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

  hasPrefix(order, key, end_depth) {
    for (let depth = at_depth; depth <= end_depth; depth++) {
      let key_depth = order(depth);
      if (this.key[key_depth] != key[key_depth]) {
        return false;
      }
    }
    return true;
  }
};

class Branch<L extends number, Value> implements Node<L, Value> {
  batch: Batch;
  children: ChildTable<L, Value>;
  _leaf: Leaf<L, Value>;
  _branchDepth: number;
  _hash: Hash;
  _count: number;
  _segmentCount: number;

  constructor(
    batch: Batch,
    branchDepth: number,
    children: ChildTable<L, Value>,
    leaf: Leaf<L, Value>,
    hash: FixedUint8Array<16>,
    count: number,
    segmentCount: number,
  ) {
    this.batch = batch;
    this.children = children;
    this._leaf = leaf;
    this._branchDepth = branchDepth;
    this._hash = hash;
    this._count = count;
    this._segmentCount = segmentCount;
  }

  branchDepth(_keyLength: L): number {
    return this._branchDepth;
  }

  leaf(): Leaf<L, Value> {
    return this._leaf;
  }

  hash(): Hash {
    return this._hash;
  }

  count(): number {
    return this._count;
  }

  eachChild(f: (child: Node<L, Value>, index: number) => void):void {
    this.children.forEach(f);
  }

  peek(order: Ordering<L>, at_depth: number): number {
    return this.leaf.peek(order, at_depth);
  }

  branch(byte: number): Node<L, Value> | undefined {
    return this.children[byte];
  }

  put(keyLength: L, order: Ordering<L>, segments: Segmentation<L>, batch: Batch, entry: Entry<L, Value>, at_depth: number): Node<L, Value> | undefined {
    let depth = at_depth;
    for (; depth < this.branchDepth(keyLength); depth++) {
      const key_order = order(depth);
      const this_key = this.leaf.key[key_order];
      const entry_key = entry.leaf.key[key_order];
      if (this_key !== entry_key) {
        const nchildren: ChildTable<L, Value> = [];
        nchildren[this_key] = this;
        nchildren[entry_key] = entry.leaf;
        const count = this._count + 1;
        const segmentCount = this.segmentCount(order, segments, depth) + 1;
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
    // Because a patch might compress an entire segment within a node below it,
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
    for (let depth = at_depth; depth < Math.min(tree_start_depth, this.branchDepth); depth++) {
      const key_depth = order(depth);
      if (this.leaf.key[key_depth] != key[key_depth]) {
        return 0;
      }
    }
    if (tree_start_depth <= this.branchDepth) {
      if (segment(key_start_depth) != segment(order(this.branchDepth))) {
        return 1;
      } else {
        return this._segmentCount;
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

  hasPrefix(order, key, end_depth, at_depth) {
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
      return child.hasPrefix(
        order,
        key,
        end_depth,
        this.branchDepth,
      );
    }
    return false;
  }
};

type Ordering<L> = {
  treeToKey: (at_depth: number) => number,
  keyToTree: (at_depth: number) => number
};

type Segmentation<L> = (at_depth: number) => number;

interface Node<L extends number, Value> {
  branchDepth(keyLength: L): number;

  count(): number;

  hash(): FixedUint8Array<16>;

  leaf(): Leaf<L, Value>;

  peek(order: Ordering<L>, depth: number): number;

  eachChild(f: (child: Node<L, Value>, index: number) => void):void;

  branch(byte: number): Node<L, Value> | undefined;

  put(keyLength: L, order: Ordering<L>, segment: Segmentation<L>, batch: Batch, entry: Entry<L, Value>, at_depth: number): Node<L, Value> | undefined;

  segmentCount(order: Ordering<L>, segment: Segmentation<L>, at_depth: number): number;

  prefixSegmentCount(
    order: Ordering<L>,
    segment: Segmentation<L>,
    key: FixedUint8Array<L>,
    key_start_depth: number,
    tree_start_depth: number,
    at_depth: number,
  ): number;

  infixes<O>(order: Ordering<L>, key: FixedUint8Array<L>, tree_start_depth: number, tree_end_depth: number, fn: (k: Uint8Array) => O, out: O[], at_depth: number): void;

  hasPrefix(order: Ordering<L>, key: any, end_depth: number, at_depth: number): boolean;
}

export class PATCH<L extends number, Value> {
  keyLength: L;
  order: Ordering<L>;
  segments: Segmentation<L>;
  child: Node<L, Value> | undefined;

  constructor(keyLength: L, order: Ordering<L>, segments: Segmentation<L>, child: Node<L, Value>) {
    this.keyLength = keyLength;
    this.order = order;
    this.segments = segments;
    this.child = child;
  }
  count() {
    if (this.child) return this.child.count();
    return 0;
  }

  put(batch: Batch, entry: Entry) {
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

  prefixSegmentCount(key, start_depth) {
    this.child.prefixSegmentCount(key, start_depth, 0);
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

  hasPrefix(key = new Uint8Array(KEY_LENGTH), end = KEY_LENGTH) {
    return this.child.hasPrefix(key, end);
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

export const emptyEAVTriblePact = new PATCH(TRIBLE_SIZE, EAVOrder, TribleSegmentation);
export const emptyEVATriblePact = new PATCH(TRIBLE_SIZE, EVAOrder, TribleSegmentation);
export const emptyAEVTriblePact = new PATCH(TRIBLE_SIZE, AEVOrder, TribleSegmentation);
export const emptyAVETriblePact = new PATCH(TRIBLE_SIZE, AVEOrder, TribleSegmentation);
export const emptyVEATriblePact = new PATCH(TRIBLE_SIZE, VEAOrder, TribleSegmentation);
export const emptyVAETriblePact = new PATCH(TRIBLE_SIZE, VAEOrder, TribleSegmentation);

export const emptyIdPATCH = new PATCH(ID_SIZE, naturalOrder, singleSegment);
export const emptyValuePATCH = new PATCH(VALUE_SIZE, naturalOrder, singleSegment);

