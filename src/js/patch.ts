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
export class Entry<L extends number, V> {
  sharedLeaf: any;
  hash: Hash;

  constructor(key: FixedUint8Array<L>, value: V) {
    this.sharedLeaf = new Leaf(key, value);
    this.hash = hash_digest(key) as Hash;
  }

  leaf<O extends Ordering<L>, S extends Segmentation<L>>(): Leaf<L, O, S, V> {
    return this.sharedLeaf;
  }
};

type Batch = object;

function batch(): Batch {
  return {};
}

type ChildTable<L extends number, O extends Ordering<L>, S extends Segmentation<S>, V> = Node<L, O, S, V>[];

function _union<L extends number, O extends Ordering<L>, S extends Segmentation<L>, V>(
  keyLength: L,
  order: O,
  segments: S,
  batch: Batch,
  leftNode: Node<L, O, S, V>,
  rightNode: Node<L, O, S, V>,
  depth: number = 0
): Node<L, O, S, V> {
  if (hash_equal(leftNode.hash(), rightNode.hash())) {
    return leftNode;
  }

  const leftBranchDepth = leftNode.branchDepth(keyLength);
  const rightBranchDepth = rightNode.branchDepth(keyLength);

  const branchDepth = Math.min(leftBranchDepth, rightBranchDepth);
  for (; depth < branchDepth; depth++) {
    const leftByte = leftNode.peek(order, depth);
    const rightByte = rightNode.peek(order, depth);

    if (leftByte !== rightByte) {
      const children: ChildTable<L, O, S, V> = [];
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

  const children: ChildTable<L, O, S, V> = [];

  if (leftBranchDepth <= rightBranchDepth) {
    leftNode.eachChild((child, index) => {
      children[index] = child;
    });
  } else {
    children[leftNode.peek(order, depth)] = leftNode;
  }

  if (rightBranchDepth <= leftBranchDepth) {
    rightNode.eachChild((child, index) => {
      if(index in children) {
        children[index] = _union(keyLength, order, segments, batch, children[index], child, branchDepth);
      } else {
        children[index] = child;
      }
    });
  } else {
    const index = rightNode.peek(order, depth);
    if(index in children) {
      children[index] = _union(keyLength, order, segments, batch, children[index], rightNode, branchDepth);
    } else {
      children[index] = rightNode;
    }
  }

  let hash = fixedUint8Array(16);
  let count = 0;
  let segmentCount = 0;
  
  children.forEach(child => {
    hash = hash_combine(hash, child.hash()) as Hash;
    count += child.count();
    segmentCount += child.segmentCount(order, segments, depth);
  });

  const leaf = (children.find(() => true) as Node<L, O, S, V>).leaf();

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

/*
function _subtract<L extends number, O extends Ordering<L>, S extends Segmentation<S>, Value>(
  keyLength: L,
  order: O,
  segments: S,
  batch: Batch,
  leftNode: Node<L, O, S, Value>,
  rightNode: Node<L, O, S, Value>,
  depth: number = 0
): Node<L, O, S, Value> | undefined {
  if (hash_equal(leftNode.hash(), rightNode.hash())) {
    return undefined;
  }

  const leftBranchDepth = leftNode.branchDepth(keyLength);
  const rightBranchDepth = rightNode.branchDepth(keyLength);

  const branchDepth = Math.min(leftBranchDepth, rightBranchDepth);
  for (; depth < branchDepth; depth++) {
    const leftByte = leftNode.peek(order, depth);
    const rightByte = rightNode.peek(order, depth);

    if (leftByte !== rightByte) {
      return leftNode;
    };
  }

  if (depth === keyLength) return leftNode;

  const children: ChildTable<L, O, S, Value> = [];

  if (leftBranchDepth <= rightBranchDepth) {
    leftNode.eachChild((child, index) => {
      children[index] = child;
    });
  } else {
    children[leftNode.peek(order, depth)] = leftNode;
  }

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

  const leaf = (children.find(() => true) as Node<L, O, S, Value>).leaf();

  if(children.length === 1) {
    return leaf;
  }

  let hash = fixedUint8Array(16);
  let count = 0;
  let segmentCount = 0;

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
  if (hash_equal(leftNode.hash(), rightNode.hash())) {
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

  const left_children: ChildTable<L, Value> = [];
  leftNode.eachChild((child, index) => {
    left_children[index] = child;
  });

  const children: ChildTable<L, Value> = [];

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

  let hash = fixedUint8Array(16);
  let count = 0;
  let segmentCount = 0;

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

function _difference<L extends number, Value>(
  keyLength: L,
  order: Ordering<L>,
  segments: Segmentation<L>,
  batch: Batch,
  leftNode: Node<L, Value>,
  rightNode: Node<L, Value>,
  depth: number = 0
): Node<L, Value> | undefined {
  if (hash_equal(leftNode.hash(), rightNode.hash()) || depth === keyLength) {
    return undefined;
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
  
  if (depth === keyLength) return undefined;

  const children: ChildTable<L, Value> = [];

  leftNode.eachChild((child, index) => {
    children[index] = child;
  });

  rightNode.eachChild((child, index) => {
    if(index in children) {
      const newChild = _difference(keyLength, order, segments, batch, children[index], child, branchDepth);
      if(newChild == undefined) {
        delete children[index];
      } else {
        children[index] = newChild;
      }
    } else {
      children[index] = child;
    }
  });

  if(children.length === 0) {
    return undefined;
  }

  const leaf = (children.find(() => true) as Node<L, Value>).leaf();

  if(children.length === 1) {
    return leaf;
  }

  let hash = fixedUint8Array(16);
  let count = 0;
  let segmentCount = 0;

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
*/

class Leaf<L extends number, O extends Ordering<L>, S extends Segmentation<L>, V> implements Node<L, O, S, V>{
  key: FixedUint8Array<L>;
  value: V;

  constructor(key: FixedUint8Array<L>, value: V) {
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

  eachChild(f: (child: Node<L, O, S, V>, index: number) => void):void {
    return;
  }

  branch(v: number): Node<L, O, S, V> | undefined {
    return undefined;
  }

  hash(): Hash {
    return hash_digest(this.key) as Hash;
  }

  leaf(): Leaf<L, O, S, V> {
    return this;
  }

  put(keyLength: L, order: O, _segment: S, batch: Batch, entry: Entry<L, V>, at_depth: number): Node<L, O, S, V> | undefined {
    let depth = at_depth;
    for (; depth < this.key.length; depth++) {
      let key_depth = order.treeToKey(depth);
      const own_key = this.key[key_depth];
      const entry_key = entry.leaf().key[key_depth];
      if (own_key !== entry_key) {
        const branchChildren: Node<L, O, S, V>[] = [];
        branchChildren[own_key] = this;
        branchChildren[entry_key] = entry.leaf();
        const hash = hash_combine(this.hash(), entry.hash) as FixedUint8Array<16>;

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

  prefixSegmentCount(order: O, _segment: S, key: FixedUint8Array<L>, key_start_depth: number, at_depth: number): number {
    const tree_start_depth = order.keyToTree(key_start_depth);
    for (let depth = at_depth; depth < tree_start_depth; depth++) {
      let key_depth = order.treeToKey(depth);
      if (this.key[key_depth] != key[key_depth]) {
        return 0;
      }
    }
    return 1;
  }

  infixes<Out>(order: O, key: FixedUint8Array<L>,
    tree_start_depth: number, _tree_end_depth: number,
    fn: (key: FixedUint8Array<L>) => Out, out: Out[],
    at_depth: number) {
    for (let depth = at_depth; depth < tree_start_depth; depth++) {
      let key_depth = order.treeToKey(depth);
      if (this.key[key_depth] != key[key_depth]) {
        return;
      }
    }
    out.push(fn(this.key));
  }

  hasPrefix(order: O, key: FixedUint8Array<L>, end_depth: number, at_depth: number) {
    for (let depth = at_depth; depth <= end_depth; depth++) {
      let key_depth = order.treeToKey(depth);
      if (this.key[key_depth] != key[key_depth]) {
        return false;
      }
    }
    return true;
  }

  get(keyLength: L, order: O, key: FixedUint8Array<L>, at_depth: number): V | undefined {
    for (let depth = at_depth; depth <= keyLength; depth++) {
      let key_depth = order.treeToKey(depth);
      if (this.key[key_depth] != key[key_depth]) {
        return undefined;
      }
    }
    return this.value;
  }
};

class Branch<L extends number, O extends Ordering<L>, S extends Segmentation<L>, V> implements Node<L, O, S, V> {
  batch: Batch;
  children: ChildTable<L, O, S, V>;
  _leaf: Leaf<L, O, S, V>;
  _branchDepth: number;
  _hash: Hash;
  _count: number;
  _segmentCount: number;

  constructor(
    batch: Batch,
    branchDepth: number,
    children: ChildTable<L, O, S, V>,
    leaf: Leaf<L, O, S, V>,
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

  leaf(): Leaf<L, O, S, V> {
    return this._leaf;
  }

  hash(): Hash {
    return this._hash;
  }

  count(): number {
    return this._count;
  }

  eachChild(f: (child: Node<L, O, S, V>, index: number) => void):void {
    this.children.forEach(f);
  }

  peek(order: O, at_depth: number): number {
    return this.leaf().peek(order, at_depth);
  }

  branch(byte: number): Node<L, O, S, V> | undefined {
    return this.children[byte];
  }

  put(keyLength: L, order: O, segments: S, batch: Batch, entry: Entry<L, V>, at_depth: number): Node<L, O, S, V> | undefined {
    let depth = at_depth;
    for (; depth < this._branchDepth; depth++) {
      const key_order = order.treeToKey(depth);
      const this_key = this.leaf().key[key_order];
      const entry_key = entry.leaf().key[key_order];
      if (this_key !== entry_key) {
        const nchildren: ChildTable<L, O, S, V> = [];
        nchildren[this_key] = this;
        nchildren[entry_key] = entry.leaf();
        const count = this._count + 1;
        const segmentCount = this.segmentCount(order, segments, depth) + 1;
        const hash = hash_combine(this.hash, entry.hash) as FixedUint8Array<16>;

        return new Branch(
          batch,
          depth,
          nchildren,
          this.leaf(),
          hash,
          count,
          segmentCount,
        );
      }
    }

    const entry_key = entry.leaf().key[order.treeToKey(this._branchDepth)];
    let nchild: Node<L, O, S, V> | undefined;
    let hash: FixedUint8Array<16>;
    let count: number;
    let segmentCount: number;

    const child = this.children[entry_key];
    if (child) {
      //We need to update the child where this key would belong.
      const oldChildHash = child.hash;
      const oldChildCount = child.count();
      const oldChildSegmentCount = child.segmentCount(order, segments, this._branchDepth);
      nchild = child.put(keyLength, order, segments, batch, entry, this._branchDepth);
      if (!nchild) return undefined;
      hash = hash_update(this.hash, oldChildHash, nchild.hash) as FixedUint8Array<16>;
      count = this._count - oldChildCount + nchild.count();
      segmentCount = this._segmentCount -
        oldChildSegmentCount +
        nchild.segmentCount(order, segments, this._branchDepth);
    } else {
      nchild = entry.leaf();
      hash = hash_combine(this.hash, entry.hash) as FixedUint8Array<16>;
      count = this._count + 1;
      segmentCount = this._segmentCount + 1;
    }

    if (this.batch === batch) {
      this.children[entry_key] = nchild;
      this._hash = hash;
      this._count = count;
      this._segmentCount = segmentCount;
      return this;
    }

    const nchildren = this.children.slice();
    nchildren[entry_key] = nchild;
    return new Branch(
      batch,
      this._branchDepth,
      nchildren,
      this.leaf(),
      hash,
      count,
      segmentCount,
    );
  }

  segmentCount(order: O, segment: S, at_depth: number) {
    // Because a patch might compress an entire segment within a node below it,
    // we need to make sure that our current node is actually inside that
    // segment and not in a segment below it.
    if (segment(order.treeToKey(at_depth)) === segment(order.treeToKey(this._branchDepth))) {
      return this._segmentCount;
    } else {
      return 1;
    }
  }

  prefixSegmentCount(
    order: O,
    segment: S,
    key: FixedUint8Array<L>,
    key_start_depth: number,
    at_depth: number,
  ): number {
    const tree_start_depth = order.keyToTree(key_start_depth);
    for (let depth = at_depth; depth < Math.min(tree_start_depth, this._branchDepth); depth++) {
      const key_depth = order.treeToKey(depth);
      if (this.leaf().key[key_depth] != key[key_depth]) {
        return 0;
      }
    }
    if (tree_start_depth <= this._branchDepth) {
      if (segment(key_start_depth) != segment(order.treeToKey(this._branchDepth))) {
        return 1;
      } else {
        return this._segmentCount;
      }
    }
    const child = this.children[key[order.treeToKey(this._branchDepth)]];
    if (child) {
      return child.prefixSegmentCount(
        order,
        segment,
        key,
        key_start_depth,
        this._branchDepth,
      );
    }
    return 0;
  }

  infixes<Out>(
    order: O, key: FixedUint8Array<L>,
    tree_start_depth: number, tree_end_depth: number,
    fn: (key: FixedUint8Array<L>) => Out, out: Out[],
    at_depth: number) {
    for (
      let depth = at_depth;
      depth < Math.min(tree_start_depth, this._branchDepth);
      depth++
    ) {
      let key_depth = order.treeToKey(depth);
      if (this.leaf().key[key_depth] != key[key_depth]) {
        return;
      }
    }
    if (tree_end_depth < this._branchDepth) {
      out.push(fn(this.leaf().key));
      return;
    }
    if (tree_start_depth > this._branchDepth) {
      const child = this.children[key[order.treeToKey(this._branchDepth)]];
      if (child) {
        child.infixes(
          order,
          key,
          tree_start_depth,
          tree_end_depth,
          fn,
          out,
          this._branchDepth,
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
        this._branchDepth,
      )
    );
  }

  hasPrefix(order: O, key: FixedUint8Array<L>, end_depth: number, at_depth: number) {
    for (
      let depth = at_depth;
      depth < Math.min(end_depth, this._branchDepth);
      depth++
    ) {
      let key_depth = order.treeToKey(depth);
      if (this.leaf().key[key_depth] != key[key_depth]) {
        return false;
      }
    }
    if (end_depth < this._branchDepth) {
      return true;
    }

    const child = this.children[key[order.treeToKey(this._branchDepth)]];
    if (child) {
      return child.hasPrefix(
        order,
        key,
        end_depth,
        this._branchDepth,
      );
    }
    return false;
  }

  get(keyLength: L, order: O, key: FixedUint8Array<L>, at_depth: number): V | undefined {
    for (
      let depth = at_depth;
      depth < this._branchDepth;
      depth++
    ) {
      let key_depth = order.treeToKey(depth);
      if (this.leaf().key[key_depth] != key[key_depth]) {
        return undefined;
      }
    }

    const child = this.children[key[order.treeToKey(this._branchDepth)]];
    if (child) {
      return child.get(
        keyLength,
        order,
        key,
        this._branchDepth,
      );
    }
    return undefined;
  }
};

type Ordering<L> = {
  treeToKey: (at_depth: number) => number,
  keyToTree: (at_depth: number) => number
};

type Segmentation<L> = (at_depth: number) => number;

interface Node<L extends number, O extends Ordering<L>, S extends Segmentation<L>, V> {
  branchDepth(keyLength: L): number;

  count(): number;

  hash(): FixedUint8Array<16>;

  leaf(): Leaf<L, O, S, V>;

  peek(order: O, depth: number): number;

  eachChild(f: (child: Node<L, O, S, V>, index: number) => void):void;

  branch(byte: number): Node<L, O, S, V> | undefined;

  put(keyLength: L, order: O, segment: S, batch: Batch, entry: Entry<L, V>, at_depth: number): Node<L, O, S, V> | undefined;

  segmentCount(order: O, segment: S, at_depth: number): number;

  prefixSegmentCount(
    order: O,
    segment: S,
    key: FixedUint8Array<L>,
    key_start_depth: number,
    at_depth: number,
  ): number;

  infixes<Out>(order: O, key: FixedUint8Array<L>, tree_start_depth: number, tree_end_depth: number, fn: (k: FixedUint8Array<L>) => Out, out: Out[], at_depth: number): void;

  hasPrefix(order: O, key: any, end_depth: number, at_depth: number): boolean;

  get(keyLength: L, order: O, key: FixedUint8Array<L>, at_depth: number): V | undefined;
}

export class PATCH<L extends number, O extends Ordering<L>, S extends Segmentation<L>, V> {
  keyLength: L;
  order: O;
  segments: S;
  child: Node<L, O, S, V> | undefined;

  constructor(keyLength: L, order: O, segments: S, child: Node<L, O, S, V> | undefined) {
    this.keyLength = keyLength;
    this.order = order;
    this.segments = segments;
    this.child = child;
  }
  count() {
    if (this.child === undefined) {
      return 0;
    }
    return this.child.count();
  }

  put(batch: Batch, entry: Entry<L, V>) {
    if (this.child === undefined) {
      return new PATCH(this.keyLength, this.order, this.segments, entry.leaf());
    }

    return new PATCH(this.keyLength, this.order, this.segments,
      this.child.put(
      this.keyLength,
      this.order,
      this.segments,
      batch,
      entry,
      0,
    ));
  }

  get(key: FixedUint8Array<L>): V | undefined {
    return this.child?.get(this.keyLength, this.order, key, 0);
  }

  has(key: FixedUint8Array<L>): boolean {
    if(this.child === undefined) {
      return false;
    }
    return this.child.hasPrefix(this.order, key, this.keyLength, 0);
  }

  prefixSegmentCount(key: FixedUint8Array<L>, start_depth: number) {
    if(this.child === undefined) {
      return 0;
    }
    return this.child.prefixSegmentCount(this.order, this.segments, key, start_depth, 0);
  }

  infixes<Out>(
    fn: (key: FixedUint8Array<L>) => Out,
    key: FixedUint8Array<L> = new Uint8Array(this.keyLength) as FixedUint8Array<L>,
    start = 0,
    end = this.keyLength,
  ) {
    const out = [];
    if(this.child !== undefined) {
      this.child.infixes(
        this.order,
        key,
        this.order.keyToTree(start),
        this.order.keyToTree(end),
        fn,
        out,
        0,
      );
    }
    return out;
  }

  hasPrefix(key: FixedUint8Array<L>, end: number): boolean {
    if (this.child === undefined) {
      return false;
    }
    return this.child.hasPrefix(this.order, key, end, 0);
  }

  isEmpty() {
    return !this.child;
  }

  isEqual(other: PATCH<L, O, S, V>) {
    return (
      this.child === other.child ||
      (!!this.child &&
        !!other.child &&
        hash_equal(this.child.hash, other.child.hash))
    );
  }

  /*
  isSubsetOf(other: PATCH<L, V>) {
    return (!this.child || (!!other.child && _isSubsetOf(this.child, other.child)));
  }

  // Note that the empty set has no intersection with itself.
  isIntersecting(other: PATCH<L, V>) {
    return (
      this.keyLength === other.keyLength &&
      !!this.child &&
      !!other.child &&
      (this.child === other.child ||
        hash_equal(this.child.hash, other.child.hash) ||
        _isIntersecting(this.child, other.child))
    );
  }
  */

  union(other: PATCH<L, O, S, V>) {
    if (!this.child) {
      return other;
    }
    if (!other.child) {
      return this;
    }
    return new PATCH(this.keyLength, this.order, this.segments,
      _union(this.keyLength, this.order, this.segments, batch(), this.child, other.child, 0));
  }

  /*
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
  */
};

function singleSegment(at_depth: number) {
  return 0;
}

const naturalOrder = {
  treeToKey: (at_depth: number) => at_depth,
  keyToTree: (at_depth: number) => at_depth,
};

export const emptyEAVTriblePact = new PATCH(TRIBLE_SIZE, EAVOrder, TribleSegmentation, undefined);
export const emptyEVATriblePact = new PATCH(TRIBLE_SIZE, EVAOrder, TribleSegmentation, undefined);
export const emptyAEVTriblePact = new PATCH(TRIBLE_SIZE, AEVOrder, TribleSegmentation, undefined);
export const emptyAVETriblePact = new PATCH(TRIBLE_SIZE, AVEOrder, TribleSegmentation, undefined);
export const emptyVEATriblePact = new PATCH(TRIBLE_SIZE, VEAOrder, TribleSegmentation, undefined);
export const emptyVAETriblePact = new PATCH(TRIBLE_SIZE, VAEOrder, TribleSegmentation, undefined);

export const emptyIdPATCH = new PATCH(ID_SIZE, naturalOrder, singleSegment, undefined);
export const emptyValuePATCH = new PATCH(VALUE_SIZE, naturalOrder, singleSegment, undefined);

