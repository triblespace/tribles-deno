import { ID_SIZE, VALUE_SIZE } from "./trible.js";
import { hash_digest, hash_combine, hash_equal, hash_update } from "./wasm.js";

// Perstistent Adaptive Cuckoo Trie (PACT)

//TODO Variadic set operations that use cursor jumping for more efficiency on multiple inputs.

function PACTHash(key) {
  if (key.__cached_hash === undefined) {
    key.__cached_hash = hash_digest(key);
  }
  return key.__cached_hash;
}

const highBit32 = 1 << 31;

function* bitIterator(bitset) {
  for (let wordPosition = 0; wordPosition < 8; wordPosition++) {
    for (let mask = 0xffffffff; ; ) {
      const c = Math.clz32(bitset[wordPosition] & mask);
      if (c === 32) break;
      yield (wordPosition << 5) + c;
      mask &= ~(highBit32 >>> c);
    }
  }
}

function nextBit(bitPosition, bitset) {
  let wordPosition = bitPosition >>> 5;
  const mask = ~0 >>> bitPosition;
  const c = Math.clz32(bitset[wordPosition] & mask);
  if (c < 32) return (wordPosition << 5) + c;
  for (wordPosition++; wordPosition < 8; wordPosition++) {
    const c = Math.clz32(bitset[wordPosition]);
    if (c < 32) return (wordPosition << 5) + c;
  }
  return 256;
}

const ctz32 = (n) => {
  // pos trailing zeros
  n |= n << 16;
  n |= n << 8;
  n |= n << 4;
  n |= n << 2;
  n |= n << 1;
  // 2. Now, inversing the bits reveals the lowest bits
  return 32 - Math.clz32(~n);
};

function prevBit(bitPosition, bitset) {
  let wordPosition = bitPosition >>> 5;
  const mask = ~(~0 >>> bitPosition);
  const c = ctz32(bitset[wordPosition] & mask);
  if (c < 32) return (wordPosition << 5) + (31 - c);
  for (wordPosition--; wordPosition > 0; wordPosition--) {
    const c = ctz32(bitset[wordPosition]);
    if (c < 32) return (wordPosition << 5) + (31 - c);
  }
  return -1;
}

const unsetBit = (bitset, bitPosition) => {
  bitset[bitPosition >>> 5] &= ~(highBit32 >>> bitPosition);
};

const setBit = (bitset, bitPosition) => {
  bitset[bitPosition >>> 5] |= highBit32 >>> bitPosition;
};

const intersectBitRange = (bitset, fromBitPosition, toBitPosition) => {
  let fromWordPosition = fromBitPosition >>> 5;
  let toWordPosition = toBitPosition >>> 5;
  for (let wordPosition = 0; wordPosition < fromWordPosition; wordPosition++) {
    bitset[wordPosition] = 0;
  }
  bitset[fromWordPosition] &= ~0 >>> fromBitPosition;
  bitset[toWordPosition] &= ~(~highBit32 >>> toBitPosition);
  for (
    let wordPosition = toWordPosition + 1;
    wordPosition < 8;
    wordPosition++
  ) {
    bitset[wordPosition] = 0;
  }
};

const hasBit = (bitset, bitPosition) => {
  return (bitset[bitPosition >>> 5] & (highBit32 >>> bitPosition)) !== 0;
};

const fullSet = () => new Uint32Array(8).fill(~0);
const emptySet = () => new Uint32Array(8);

const noBit = (bitset) =>
  bitset[0] === 0 &&
  bitset[1] === 0 &&
  bitset[2] === 0 &&
  bitset[3] === 0 &&
  bitset[4] === 0 &&
  bitset[5] === 0 &&
  bitset[6] === 0 &&
  bitset[7] === 0;

const setAllBit = (bitset) => {
  bitset[0] = ~0;
  bitset[1] = ~0;
  bitset[2] = ~0;
  bitset[3] = ~0;
  bitset[4] = ~0;
  bitset[5] = ~0;
  bitset[6] = ~0;
  bitset[7] = ~0;
};

const unsetAllBit = (bitset) => {
  bitset[0] = 0;
  bitset[1] = 0;
  bitset[2] = 0;
  bitset[3] = 0;
  bitset[4] = 0;
  bitset[5] = 0;
  bitset[6] = 0;
  bitset[7] = 0;
};

const bitIntersect = (left, right, out = left) => {
  out[0] = left[0] & right[0];
  out[1] = left[1] & right[1];
  out[2] = left[2] & right[2];
  out[3] = left[3] & right[3];
  out[4] = left[4] & right[4];
  out[5] = left[5] & right[5];
  out[6] = left[6] & right[6];
  out[7] = left[7] & right[7];
};

const bitUnion = (left, right, out = left) => {
  out[0] = left[0] | right[0];
  out[1] = left[1] | right[1];
  out[2] = left[2] | right[2];
  out[3] = left[3] | right[3];
  out[4] = left[4] | right[4];
  out[5] = left[5] | right[5];
  out[6] = left[6] | right[6];
  out[7] = left[7] | right[7];
};

const bitSubtract = (left, right, out = left) => {
  out[0] = left[0] & ~right[0];
  out[1] = left[1] & ~right[1];
  out[2] = left[2] & ~right[2];
  out[3] = left[3] & ~right[3];
  out[4] = left[4] & ~right[4];
  out[5] = left[5] & ~right[5];
  out[6] = left[6] & ~right[6];
  out[7] = left[7] & ~right[7];
};

const bitDiff = (left, right, out = left) => {
  out[0] = left[0] ^ right[0];
  out[1] = left[1] ^ right[1];
  out[2] = left[2] ^ right[2];
  out[3] = left[3] ^ right[3];
  out[4] = left[4] ^ right[4];
  out[5] = left[5] ^ right[5];
  out[6] = left[6] ^ right[6];
  out[7] = left[7] ^ right[7];
};

const singleBitIntersect = (bitset, bit) => {
  const hadBit = hasBit(bitset, bit);
  unsetAllBit(bitset);
  if (hadBit) setBit(bitset, bit);
};

const makePACT = function (segmentCompression, segmentSize = 32) {
  const KEY_LENGTH = segmentCompression.reduce((a, n) => a + n, 0);
  if (KEY_LENGTH > 128) {
    throw Error("Compressed key must not be longer than 128 bytes.");
  }
  const SEGMENT_LUT = new Uint8Array(KEY_LENGTH + 1);
  SEGMENT_LUT.set(segmentCompression.flatMap((l, i) => new Array(l).fill(i)));
  SEGMENT_LUT[SEGMENT_LUT.length - 1] = SEGMENT_LUT[SEGMENT_LUT.length - 2];
  const DEPTH_MAPPING = new Uint8Array(segmentCompression.length * segmentSize);
  let depth = 0;
  let key_depth = 0;
  for (const s of segmentCompression) {
    const pad = segmentSize - s;
    for (let j = 0; j < pad; j++) {
      DEPTH_MAPPING[depth] = 0b10000000 | key_depth;
      depth++;
    }
    for (let j = pad; j < segmentSize; j++) {
      DEPTH_MAPPING[depth] = key_depth;
      depth++;
      key_depth++;
    }
  }
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
      this.pathNodes = new Array(KEY_LENGTH + 1).fill(null);

      this.pathNodes[0] = pact.child;
    }

    segmentCount() {
      const depth = DEPTH_MAPPING[this.depth] & 0b01111111;
      const node = this.pathNodes[depth];
      if (node === null) return 0;
      return node.segmentCount(depth);
    }

    peek() {
      const depth = DEPTH_MAPPING[this.depth];
      if ((depth & 0b10000000) !== 0) {
        return 0;
      }
      return this.pathNodes[depth].peek(depth);
    }

    propose(bitset) {
      let depth = DEPTH_MAPPING[this.depth];
      if ((depth & 0b10000000) !== 0) {
        singleBitIntersect(bitset, 0);
      } else {
        const node = this.pathNodes[depth];
        if (node === null) {
          unsetAllBit(bitset);
        } else {
          node.propose(depth, bitset);
        }
      }
    }

    pop() {
      this.depth--;
    }

    push(byte) {
      let depth = DEPTH_MAPPING[this.depth];
      if ((depth & 0b10000000) === 0) {
        const node = this.pathNodes[depth].getFast(depth, byte);
        if (node == null) return false;
        this.pathNodes[depth + 1] = node;
      }
      this.depth++;
      return true;
    }
  };

  function _union(
    leftNode,
    rightNode,
    depth = 0,
    key = new Uint8Array(KEY_LENGTH)
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

    const unionChildbits = emptySet();
    const leftChildbits = fullSet();
    const rightChildbits = fullSet();
    const intersectChildbits = emptySet();
    const children = [];
    let hash = new Uint8Array(16);
    let count = 0;
    let segmentCount = 0;

    leftNode.propose(depth, leftChildbits);
    rightNode.propose(depth, rightChildbits);

    bitUnion(leftChildbits, rightChildbits, unionChildbits);
    bitIntersect(leftChildbits, rightChildbits, intersectChildbits);
    bitSubtract(leftChildbits, intersectChildbits, leftChildbits);
    bitSubtract(rightChildbits, intersectChildbits, rightChildbits);

    for (let index of bitIterator(leftChildbits)) {
      const child = leftNode.get(depth, index);
      children[index] = child;
      hash = hash_combine(hash, child.hash);
      count += child.count();
      segmentCount += child.segmentCount(depth);
    }

    for (let index of bitIterator(rightChildbits)) {
      const child = rightNode.get(depth, index);

      children[index] = child;
      hash = hash_combine(hash, child.hash);
      count += child.count();
      segmentCount += child.segmentCount(depth);
    }

    for (let index of bitIterator(intersectChildbits)) {
      key[depth] = index;
      const leftChild = leftNode.get(depth, index);
      const rightChild = rightNode.get(depth, index);

      key[depth] = index;
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
      {}
    );
  }

  function _subtract(
    leftNode,
    rightNode,
    depth = 0,
    key = new Uint8Array(KEY_LENGTH)
  ) {
    if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH)
      return null;
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    for (; depth < maxDepth; depth++) {
      const leftByte = leftNode.peek(depth);
      if (leftByte !== rightNode.peek(depth)) {
        return leftNode;
      }
      key[depth] = leftByte;
    }
    if (depth === KEY_LENGTH) return null;

    const leftChildbits = fullSet();
    const rightChildbits = fullSet();
    const intersectChildbits = emptySet();
    const children = [];
    let hash = new Uint8Array(16);
    let count = 0;
    let segmentCount = 0;

    leftNode.propose(depth, leftChildbits);
    rightNode.propose(depth, rightChildbits);

    bitIntersect(leftChildbits, rightChildbits, intersectChildbits);
    bitSubtract(leftChildbits, intersectChildbits, leftChildbits);

    for (let index of bitIterator(leftChildbits)) {
      const child = leftNode.get(depth, index);
      children[index] = child;
      hash = hash_combine(hash, child.hash);
      count += child.count();
      segmentCount += child.segmentCount(depth);
    }

    for (let index of bitIterator(intersectChildbits)) {
      const leftChild = leftNode.get(depth, index);
      const rightChild = rightNode.get(depth, index);

      key[depth] = index;
      const diff = _subtract(leftChild, rightChild, depth + 1);
      if (diff !== null) {
        setBit(leftChildbits, index);
        children[index] = diff;
        hash = hash_combine(hash, diff.hash);
        count += diff.count();
        segmentCount += diff.segmentCount(depth);
      }
    }
    if (noBit(leftChildbits)) return null;
    return new PACTNode(
      key.slice(),
      depth,
      leftChildbits,
      children,
      hash,
      count,
      segmentCount,
      {}
    );
  }

  function _intersect(
    leftNode,
    rightNode,
    depth = 0,
    key = new Uint8Array(KEY_LENGTH)
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

    const intersectChildbits = fullSet();
    const children = [];
    let hash = new Uint8Array(16);
    let count = 0;
    let segmentCount = 0;

    setAllBit(intersectChildbits);
    leftNode.propose(depth, intersectChildbits);
    rightNode.propose(depth, intersectChildbits);

    for (let index of bitIterator(intersectChildbits)) {
      const leftChild = leftNode.get(depth, index);
      const rightChild = rightNode.get(depth, index);

      key[depth] = index;
      const intersection = _intersect(leftChild, rightChild, depth + 1);
      if (intersection === null) {
        unsetBit(intersectChildbits, index);
      } else {
        children[index] = intersection;
        hash = hash_combine(hash, intersection.hash);
        count += intersection.count();
        segmentCount += intersection.segmentCount(depth);
      }
    }
    if (noBit(intersectChildbits)) return null;

    return new PACTNode(
      key.slice(),
      depth,
      intersectChildbits,
      children,
      hash,
      count,
      segmentCount,
      {}
    );
  }

  function _difference(
    leftNode,
    rightNode,
    depth = 0,
    key = new Uint8Array(KEY_LENGTH)
  ) {
    if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH)
      return null;
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    for (; depth < maxDepth; depth++) {
      const leftByte = leftNode.peek(depth);
      if (leftByte !== rightNode.peek(depth)) break;
      key[depth] = leftByte;
    }
    if (depth === KEY_LENGTH) return null;

    const leftChildbits = fullSet();
    const rightChildbits = fullSet();
    const intersectChildbits = emptySet();
    const diffChildbits = emptySet();

    const children = [];
    let hash = new Uint8Array(16);
    let count = 0;
    let segmentCount = 0;

    leftNode.propose(depth, leftChildbits);
    rightNode.propose(depth, rightChildbits);

    bitIntersect(leftChildbits, rightChildbits, intersectChildbits);
    bitSubtract(leftChildbits, intersectChildbits, leftChildbits);
    bitSubtract(rightChildbits, intersectChildbits, rightChildbits);
    bitDiff(leftChildbits, rightChildbits, diffChildbits);

    for (let index of bitIterator(leftChildbits)) {
      const child = leftNode.get(depth, index);
      children[index] = child;
      hash = hash_combine(hash, child.hash);
      count += child.count();
      segmentCount += child.segmentCount(depth);
    }

    for (let index of bitIterator(rightChildbits)) {
      const child = rightNode.get(depth, index);
      children[index] = child;
      hash = hash_combine(hash, child.hash);
      count += child.count();
      segmentCount += child.segmentCount(depth);
    }

    for (let index of bitIterator(intersectChildbits)) {
      const leftChild = leftNode.get(depth, index);
      const rightChild = rightNode.get(depth, index);

      key[depth] = index;
      const difference = _difference(leftChild, rightChild, depth + 1);
      if (difference !== null) {
        setBit(diffChildbits, index);
        children[index] = difference;
        hash = hash_combine(hash, difference.hash);
        count += difference.count();
        segmentCount += difference.segmentCount(depth);
      }
    }
    if (noBit(diffChildbits)) return null;

    return new PACTNode(
      key.slice(),
      depth,
      diffChildbits,
      children,
      hash,
      count,
      segmentCount,
      {}
    );
  }

  function _isSubsetOf(leftNode, rightNode, depth = 0) {
    if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH)
      return true;
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    for (; depth < maxDepth; depth++) {
      if (leftNode.peek(depth) !== rightNode.peek(depth)) break;
    }
    if (depth === KEY_LENGTH) return true;

    const leftChildbits = fullSet();
    const rightChildbits = fullSet();
    const intersectChildbits = emptySet();

    leftNode.propose(depth, leftChildbits);
    rightNode.propose(depth, rightChildbits);

    bitIntersect(leftChildbits, rightChildbits, intersectChildbits);
    bitSubtract(leftChildbits, intersectChildbits, leftChildbits);

    if (!noBit(leftChildbits)) return false;

    for (let index of bitIterator(intersectChildbits)) {
      const leftChild = leftNode.get(depth, index);
      const rightChild = rightNode.get(depth, index);
      if (!_isSubsetOf(leftChild, rightChild, depth + 1)) {
        return false;
      }
    }
    return true;
  }

  function _isIntersecting(leftNode, rightNode, depth = 0) {
    if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH)
      return true;
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    for (; depth < maxDepth; depth++) {
      if (leftNode.peek(depth) !== rightNode.peek(depth)) {
        return false;
      }
    }
    if (depth === KEY_LENGTH) return true;

    const intersectChildbits = fullSet();

    leftNode.propose(depth, intersectChildbits);
    rightNode.propose(depth, intersectChildbits);

    for (let index of bitIterator(intersectChildbits)) {
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
      for (let index of bitIterator(node.childbits)) {
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
      singleBitIntersect(bitset, this.key[depth - this.depth]);
    }

    get(depth, v) {
      if (depth < KEY_LENGTH && this.key[depth - this.depth] === v) return this;
      return null;
    }

    getFast(depth, v) {
      if (depth < KEY_LENGTH) return this;
      return null;
    }

    put(depth, key, value, owner) {
      while (depth < KEY_LENGTH && this.key[depth - this.depth] === key[depth])
        depth += 1;

      if (depth === KEY_LENGTH) {
        return this;
      }

      const sibling = new PACTLeaf(depth + 1, key, value, PACTHash(key));

      const branchChildren = [];
      const leftIndex = this.key[depth - this.depth];
      const rightIndex = key[depth];
      branchChildren[leftIndex] = this;
      branchChildren[rightIndex] = sibling;
      const branchChildbits = emptySet();
      setBit(branchChildbits, leftIndex);
      setBit(branchChildbits, rightIndex);
      const hash = hash_combine(this.hash, sibling.hash);

      return new PACTNode(
        key,
        depth,
        branchChildbits,
        branchChildren,
        hash,
        2,
        2,
        owner
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
      owner
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
        singleBitIntersect(bitset, this.key[depth]);
      } else {
        bitIntersect(bitset, this.childbits);
      }
    }

    get(depth, v) {
      if (depth === this.branchDepth) {
        if (hasBit(this.childbits, v)) return this.children[v];
      } else {
        if (this.key[depth] === v) return this;
      }
      return null;
    }

    getFast(depth, v) {
      if (depth === this.branchDepth) {
        return this.children[v];
      } else {
        return this;
      }
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
        if (hasBit(this.childbits, pos)) {
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
          segmentCount =
            this._segmentCount -
            oldChildSegmentCount +
            nchild.segmentCount(this.branchDepth);

          if (this.owner === owner) {
            this.children[pos] = nchild;
            this.hash = hash;
            this._count = count;
            this._segmentCount = segmentCount;
            return this;
          }
          nchildbits = this.childbits.slice();
        } else {
          nchild = new PACTLeaf(depth + 1, key, value, PACTHash(key));
          hash = hash_combine(this.hash, nchild.hash);
          count = this._count + 1;
          segmentCount = this._segmentCount + 1;
          if (this.owner === owner) {
            setBit(this.childbits, pos);
            this.children[pos] = nchild;
            this.hash = hash;
            this._count = count;
            this._segmentCount = segmentCount;
            return this;
          }
          nchildbits = this.childbits.slice();
          setBit(nchildbits, pos);
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
          owner
        );
      }

      const nchild = new PACTLeaf(depth + 1, key, value, PACTHash(key));

      const nchildren = [];
      const lindex = this.key[depth];
      const rindex = key[depth];
      nchildren[lindex] = this;
      nchildren[rindex] = nchild;
      const nchildbits = emptySet();
      setBit(nchildbits, lindex);
      setBit(nchildbits, rindex);
      const count = this._count + 1;
      // We need to check if this insered moved our branchDepth across a segment boundary.
      const segmentCount =
        SEGMENT_LUT[depth] === SEGMENT_LUT[this.branchDepth]
          ? this._segmentCount + 1
          : 1;
      const hash = hash_combine(this.hash, nchild.hash);

      return new PACTNode(
        this.key,
        depth,
        nchildbits,
        nchildren,
        hash,
        count,
        segmentCount,
        owner
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
  bitIterator,
  nextBit,
  prevBit,
  singleBitIntersect,
  bitIntersect,
  intersectBitRange,
  setBit,
  unsetAllBit,
  setAllBit,
};
