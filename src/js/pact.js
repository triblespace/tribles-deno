import { ID_SIZE, VALUE_SIZE } from "./trible.js";
import { hash_combine, hash_digest, hash_equal, hash_update } from "./wasm.js";
import { ByteBitset } from "./bitset.js";

// Perstistent Adaptive Cuckoo Trie (PACT)

//TODO Variadic set operations that use cursor jumping for more efficiency on multiple inputs.

function PACTHash(key) {
  if (key.__cached_hash === undefined) {
    key.__cached_hash = hash_digest(key);
  }
  return key.__cached_hash;
}

const PaddedCursor = class {
  constructor(cursor, segments, segment_size) {
    this.cursor = cursor;
    this.depth = 0;

    this.padding = (new ByteBitset()).setAll();
    let depth = 0;
    for (const s of segments) {
      const pad = segment_size - s;

      depth += pad;
      for (let j = pad; j < segment_size; j++) {
        this.padding.unset(depth);
        depth += 1;
      }
    }
  }

  // Interface API >>>

  peek() {
    if (this.padding.has(this.depth)) return 0;
    return this.cursor.peek();
  }

  propose(bitset) {
    if (this.padding.has(this.depth)) {
      bitset.unsetAll();
      bitset.set(0);
    } else {
      this.cursor.propose(bitset);
    }
  }

  push(key_fragment) {
    if (!this.padding.has(this.depth)) {
      this.cursor.push(key_fragment);
    }
    this.depth += 1;
  }

  pop() {
    this.depth -= 1;
    if (!this.padding.has(this.depth)) {
      this.cursor.pop();
    }
  }

  segmentCount() {
    return this.cursor.segmentCount();
  }

  // <<< Interface API
};

export class SegmentConstraint {
  constructor(pact, segmentVariables) {
    if (pact.segments.length !== segmentVariables.length) {
      throw new Error(
        "Number of segment variables must match the number of segments.",
      );
    }
    if (new Set(segmentVariables).size !== segmentVariables.length) {
      throw new Error(
        "Segment variables must be unique. Use explicit equality when inner constraints are required.",
      );
    }

    this.nextVariableIndex = 0;
    this.cursor = new PaddedCursor(pact.cursor(), pact.segments, 32);
    this.segmentVariables = segmentVariables;
  }

  peekByte() {
    if (this.nextVariableIndex === 0) {
      throw new error("unreachable");
    }
    return this.cursor.peek();
  }

  proposeByte(bitset) {
    if (this.nextVariableIndex === 0) {
      throw new error("unreachable");
    }
    this.cursor.propose(bitset);
  }

  pushByte(byte) {
    if (this.nextVariableIndex === 0) {
      throw new error("unreachable");
    }
    this.cursor.push(byte);
  }

  popByte() {
    if (this.nextVariableIndex === 0) {
      throw new error("unreachable");
    }
    this.cursor.pop();
  }

  variables(bitset) {
    bitset.unsetAll();
    for (const variable of this.segmentVariables) {
      bitset.set(variable);
    }
  }

  blocked(bitset) {
    bitset.unsetAll();
    for (
      let i = this.nextVariableIndex + 1;
      i < this.segmentVariables.length;
      i++
    ) {
      bitset.set(this.segmentVariables[i]);
    }
  }

  pushVariable(variable) {
    if (this.segmentVariables[this.nextVariableIndex] === variable) {
      this.nextVariableIndex++;
    }
  }

  popVariable() {
    if (this.nextVariableIndex === 0) {
      throw new error("unreachable");
    }
    this.nextVariableIndex--;
  }

  variableCosts(variable) {
    if (this.segmentVariables[this.nextVariableIndex] === variable) {
      return this.cursor.segmentCount();
    }
  }
}

const makePACT = function (segments) {
  const KEY_LENGTH = segments.reduce((a, n) => a + n, 0);
  if (KEY_LENGTH > 128) {
    throw Error("Compressed key must not be longer than 128 bytes.");
  }
  const SEGMENT_LUT = new Uint8Array(KEY_LENGTH + 1);
  SEGMENT_LUT.set(segments.flatMap((l, i) => new Array(l).fill(i)));
  SEGMENT_LUT[SEGMENT_LUT.length - 1] = SEGMENT_LUT[SEGMENT_LUT.length - 2];
  // deno-lint-ignore prefer-const
  let PACTCursor;
  // deno-lint-ignore prefer-const
  let PACTTree;
  // deno-lint-ignore prefer-const
  let PACTBatch;
  // deno-lint-ignore prefer-const
  let PACTLeaf;
  // deno-lint-ignore prefer-const
  let PACTNode;

  PACTCursor = class {
    constructor(pact) {
      this.pact = pact;
      this.depth = 0;
      this.path = new Array(KEY_LENGTH + 1).fill(null);

      this.path[0] = pact.child;
    }

    peek() {
      const node = this.path[this.depth];
      if (node === null) return null;
      return node.peek(this.depth);
    }

    propose(bitset) {
      const node = this.path[this.depth];
      if (node === null) {
        bitset.unsetAll();
      } else {
        node.propose(this.depth, bitset);
      }
    }

    pop() {
      this.depth--;
    }

    push(byte) {
      const node = this.path[this.depth].get(this.depth, byte);
      this.depth++;
      this.path[this.depth] = node;
    }

    segmentCount() {
      const node = this.path[this.depth];
      if (node === null) return 0;
      return node.segmentCount(this.depth);
    }
  };

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

    return new PACTNode(
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
      return null;
    }
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    for (; depth < maxDepth; depth++) {
      const leftByte = leftNode.peek(depth);
      if (leftByte !== rightNode.peek(depth)) {
        return leftNode;
      }
      key[depth] = leftByte;
    }
    if (depth === KEY_LENGTH) return null;

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
      if (diff !== null) {
        leftChildbits.set(index);
        children[index] = diff;
        hash = hash_combine(hash, diff.hash);
        count += diff.count();
        segmentCount += diff.segmentCount(depth);
      }
    }
    if (leftChildbits.isEmpty()) return null;
    return new PACTNode(
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
      if (leftByte !== rightNode.peek(depth)) return null;
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
      if (intersection === null) {
        intersectChildbits.unset(index);
      } else {
        children[index] = intersection;
        hash = hash_combine(hash, intersection.hash);
        count += intersection.count();
        segmentCount += intersection.segmentCount(depth);
      }
    }
    if (intersectChildbits.isEmpty()) return null;

    return new PACTNode(
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
      return null;
    }
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    for (; depth < maxDepth; depth++) {
      const leftByte = leftNode.peek(depth);
      if (leftByte !== rightNode.peek(depth)) break;
      key[depth] = leftByte;
    }
    if (depth === KEY_LENGTH) return null;

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
      if (difference !== null) {
        diffChildbits.set(index);
        children[index] = difference;
        hash = hash_combine(hash, difference.hash);
        count += difference.count();
        segmentCount += difference.segmentCount(depth);
      }
    }
    if (diffChildbits.isEmpty()) return null;

    return new PACTNode(
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

  function* _walk(node, key = new Uint8Array(KEY_LENGTH), depth = 0) {
    for (; depth < node.branchDepth; depth++) {
      key[depth] = node.peek(depth);
    }
    if (depth === KEY_LENGTH) {
      yield [key, node.value];
    } else {
      for (let index of node.childbits.entries()) {
        key[depth] = index;
        const child = node.get(depth, index);
        yield* _walk(child, key, depth + 1);
      }
    }
  }

  PACTBatch = class {
    constructor(child) {
      this.child = child;
      this.owner = {};
      this.completed = false;
    }
    complete() {
      if (this.completed) throw Error("Batch already completed.");
      this.completed = true;
      return new PACTTree(this.child);
    }
    put(key, value = null) {
      if (this.completed) {
        throw Error("Can't put into already completed batch.");
      }
      if (this.child) {
        this.child = this.child.put(0, key, value, this.owner);
      } else {
        this.child = new PACTLeaf(0, key, value, PACTHash(key));
      }
      return this;
    }
  };

  PACTTree = class {
    constructor(child = null) {
      this.keyLength = KEY_LENGTH;
      this.child = child;
      this.segments = segments;
    }

    batch() {
      return new PACTBatch(this.child);
    }

    count() {
      if (this.child === null) return 0;
      return this.child.count();
    }

    put(key, value = null) {
      if (this.child !== null) {
        const nchild = this.child.put(0, key, value, {});
        if (this.child === nchild) return this;
        return new PACTTree(nchild);
      }
      return new PACTTree(new PACTLeaf(0, key, value, PACTHash(key)));
    }
    get(key) {
      let node = this.child;
      if (node === null) return undefined;
      for (let depth = 0; depth < KEY_LENGTH; depth++) {
        const sought = key[depth];
        node = node.get(depth, sought);
        if (node === null) return undefined;
      }
      return node.value;
    }

    segmentConstraint(vars) {
      return new SegmentConstraint(this, vars.map((v) => v.index));
    }

    cursor() {
      return new PACTCursor(this);
    }

    isEmpty() {
      return this.child === null;
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
      const thisNode = this.child;
      const otherNode = other.child;
      if (thisNode === null) {
        return new PACTTree(otherNode);
      }
      if (otherNode === null) {
        return new PACTTree(thisNode);
      }
      return new PACTTree(_union(thisNode, otherNode));
    }

    subtract(other) {
      const thisNode = this.child;
      const otherNode = other.child;
      if (otherNode === null) {
        return new PACTTree(thisNode);
      }
      if (
        this.child === null ||
        hash_equal(this.child.hash, other.child.hash)
      ) {
        return new PACTTree();
      } else {
        return new PACTTree(_subtract(thisNode, otherNode));
      }
    }

    intersect(other) {
      const thisNode = this.child;
      const otherNode = other.child;

      if (thisNode === null || otherNode === null) {
        return new PACTTree(null);
      }
      if (thisNode === otherNode || hash_equal(thisNode.hash, otherNode.hash)) {
        return new PACTTree(otherNode);
      }
      return new PACTTree(_intersect(thisNode, otherNode));
    }

    difference(other) {
      const thisNode = this.child;
      const otherNode = other.child;

      if (thisNode === null) {
        return new PACTTree(otherNode);
      }
      if (otherNode === null) {
        return new PACTTree(thisNode);
      }
      if (thisNode === otherNode || hash_equal(thisNode.hash, otherNode.hash)) {
        return new PACTTree(null);
      }
      return new PACTTree(_difference(thisNode, otherNode));
    }

    *entries() {
      if (this.child === null) return;
      for (const [k, v] of _walk(this.child)) {
        yield [k.slice(), v];
      }
    }

    *keys() {
      if (this.child === null) return;
      for (const [k, v] of _walk(this.child)) {
        yield k.slice();
      }
    }

    *values() {
      if (this.child === null) return;
      for (const [k, v] of _walk(this.child)) {
        yield v;
      }
    }
  };

  PACTLeaf = class {
    constructor(depth, key, value, hash) {
      this.key = key.slice(depth);
      this.value = value;
      this.hash = hash;
      this.depth = depth;
      this.branchDepth = KEY_LENGTH;
    }

    count() {
      return 1;
    }

    segmentCount(_depth) {
      return 1;
    }

    peek(depth) {
      return this.key[depth - this.depth];
    }

    propose(depth, bitset) {
      bitset.unsetAll();
      bitset.set(this.key[depth - this.depth]);
    }

    get(depth, v) {
      if (depth < KEY_LENGTH && this.key[depth - this.depth] === v) return this;
      return null;
    }

    put(depth, key, value, owner) {
      while (
        depth < KEY_LENGTH && this.key[depth - this.depth] === key[depth]
      ) {
        depth += 1;
      }

      if (depth === KEY_LENGTH) {
        return this;
      }

      const sibling = new PACTLeaf(depth + 1, key, value, PACTHash(key));

      const branchChildren = [];
      const leftIndex = this.key[depth - this.depth];
      const rightIndex = key[depth];
      branchChildren[leftIndex] = this;
      branchChildren[rightIndex] = sibling;
      const branchChildbits = (new ByteBitset()).unsetAll();
      branchChildbits.set(leftIndex);
      branchChildbits.set(rightIndex);
      const hash = hash_combine(this.hash, sibling.hash);

      return new PACTNode(
        key,
        depth,
        branchChildbits,
        branchChildren,
        hash,
        2,
        2,
        owner,
      );
    }
  };

  PACTNode = class {
    constructor(
      key,
      branchDepth,
      childbits,
      children,
      hash,
      count,
      segmentCount,
      owner,
    ) {
      this.key = key;
      this.branchDepth = branchDepth;
      this.childbits = childbits;
      this.children = children;
      this.hash = hash;
      this._count = count;
      this._segmentCount = segmentCount;
      this.owner = owner;
    }

    count() {
      return this._count;
    }

    segmentCount(depth) {
      // Because a pact might compress an entire segment within a node below it,
      // we need to make sure that our current node is actually inside that
      // segment and not in a segment below it.
      if (SEGMENT_LUT[depth] === SEGMENT_LUT[this.branchDepth]) {
        return this._segmentCount;
      } else {
        return 1;
      }
    }

    peek(depth) {
      if (depth < this.branchDepth) {
        return this.key[depth];
      } else {
        return null;
      }
    }

    propose(depth, bitset) {
      if (depth < this.branchDepth) {
        bitset.unsetAll();
        bitset.set(this.key[depth]);
      } else {
        bitset.setFrom(this.childbits);
      }
    }

    get(depth, v) {
      if (depth === this.branchDepth) {
        if (this.childbits.has(v)) return this.children[v];
      } else {
        if (this.key[depth] === v) return this;
      }
      return null;
    }

    put(depth, key, value, owner) {
      for (; depth < this.branchDepth; depth++) {
        if (this.key[depth] !== key[depth]) break;
      }

      if (depth === this.branchDepth) {
        const pos = key[this.branchDepth];
        const childDepth = this.branchDepth + 1;
        let nchildbits;
        let nchild;
        let hash;
        let count;
        let segmentCount;
        if (this.childbits.has(pos)) {
          const child = this.children[pos];
          //We need to update the child where this key would belong.
          const oldChildHash = child.hash;
          const oldChildBranchDepth = child.branchDepth;
          const oldChildCount = child.count();
          const oldChildSegmentCount = child.segmentCount(this.branchDepth);
          nchild = child.put(childDepth, key, value, owner);
          if (hash_equal(oldChildHash, nchild.hash)) return this;
          hash = hash_update(this.hash, oldChildHash, nchild.hash);
          count = this._count - oldChildCount + nchild.count();
          segmentCount = this._segmentCount -
            oldChildSegmentCount +
            nchild.segmentCount(this.branchDepth);

          if (this.owner === owner) {
            this.children[pos] = nchild;
            this.hash = hash;
            this._count = count;
            this._segmentCount = segmentCount;
            return this;
          }
          nchildbits = this.childbits.copy();
        } else {
          nchild = new PACTLeaf(depth + 1, key, value, PACTHash(key));
          hash = hash_combine(this.hash, nchild.hash);
          count = this._count + 1;
          segmentCount = this._segmentCount + 1;
          if (this.owner === owner) {
            this.childbits.set(pos);
            this.children[pos] = nchild;
            this.hash = hash;
            this._count = count;
            this._segmentCount = segmentCount;
            return this;
          }
          nchildbits = this.childbits.copy();
          nchildbits.set(pos);
        }
        const nchildren = this.children.slice();
        nchildren[pos] = nchild;
        return new PACTNode(
          this.key,
          this.branchDepth,
          nchildbits,
          nchildren,
          hash,
          count,
          segmentCount,
          owner,
        );
      }

      const nchild = new PACTLeaf(depth + 1, key, value, PACTHash(key));

      const nchildren = [];
      const lindex = this.key[depth];
      const rindex = key[depth];
      nchildren[lindex] = this;
      nchildren[rindex] = nchild;
      const nchildbits = (new ByteBitset()).unsetAll();
      nchildbits.set(lindex);
      nchildbits.set(rindex);
      const count = this._count + 1;
      // We need to check if this insered moved our branchDepth across a segment boundary.
      const segmentCount = SEGMENT_LUT[depth] === SEGMENT_LUT[this.branchDepth]
        ? this._segmentCount + 1
        : 2;
      const hash = hash_combine(this.hash, nchild.hash);

      return new PACTNode(
        this.key,
        depth,
        nchildbits,
        nchildren,
        hash,
        count,
        segmentCount,
        owner,
      );
    }
  };

  return new PACTTree();
};

const emptyIdIdValueTriblePACT = makePACT([ID_SIZE, ID_SIZE, VALUE_SIZE]);
const emptyIdValueIdTriblePACT = makePACT([ID_SIZE, VALUE_SIZE, ID_SIZE]);
const emptyValueIdIdTriblePACT = makePACT([VALUE_SIZE, ID_SIZE, ID_SIZE]);
const emptyTriblePACT = emptyIdIdValueTriblePACT;

const emptyIdPACT = makePACT([ID_SIZE]);
const emptyValuePACT = makePACT([VALUE_SIZE]);

export {
  emptyIdIdValueTriblePACT,
  emptyIdPACT,
  emptyIdValueIdTriblePACT,
  emptyTriblePACT,
  emptyValueIdIdTriblePACT,
  emptyValuePACT,
  makePACT,
  PACTHash,
  PaddedCursor,
};
