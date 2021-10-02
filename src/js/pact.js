import { ID_SIZE, VALUE_SIZE } from "./trible.js";
import { hash_digest, hash_combine, hash_equal, hash_update } from "./wasm.js";

// Perstistent Adaptive Cuckoo Trie (PACT)

//TODO Variadic set operations that use cursor jumping for more efficiency on multiple inputs.

const nextKey = (key, ascending = true) => {
  for (let i = key.length - 1; 0 <= i; i--) {
    if (key[i] === (ascending ? 255 : 0)) {
      key[i] = ascending ? 0 : 255;
    } else {
      key[i] += ascending ? 1 : -1;
      return true;
    }
  }
  return false;
};

function PACTHash(key) {
  if (key.__cached_hash === undefined) {
    key.__cached_hash = hash_digest(key);
  }
  return key.__cached_hash;
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

const highBit32 = 1 << 31;

function* bitIterator(bitset, ascending = true) {
  for (let wordPosition = 0; wordPosition < 8; wordPosition++) {
    for (let mask = 0xffffffff; ; ) {
      const c = Math.clz32(bitset[wordPosition] & mask);
      if (c === 32) break;
      yield (wordPosition << 5) + c;
      mask &= ~(highBit32 >>> c);
    }
  }
}

const setBit = (bitset, bitPosition) => {
  bitset[bitPosition >>> 5] |= highBit32 >>> bitPosition;
};

const hasBit = (bitset, bitPosition) => {
  return (bitset[bitPosition >>> 5] & (highBit32 >>> bitPosition)) !== 0;
};

const nextBit = (bitset, bitPosition) => {
  let wordPosition = bitPosition >>> 5;
  const c = Math.clz32(bitset[wordPosition] & (-1 >>> (bitPosition & 0b11111)));
  if (c !== 32) return (wordPosition << 5) + c;
  for (wordPosition++; wordPosition < 8; wordPosition++) {
    const c = Math.clz32(bitset[wordPosition]);
    if (c !== 32) return (wordPosition << 5) + c;
  }
  return 256;
};

const prevBit = (bitset, bitPosition) => {
  let wordPosition = bitPosition >>> 5;
  const c =
    31 - ctz32(bitset[wordPosition] & (-1 << (31 - (bitPosition & 0b11111))));
  if (c !== -1) return (wordPosition << 5) + c;
  for (wordPosition--; 0 <= wordPosition; wordPosition--) {
    const c = 31 - ctz32(bitset[wordPosition]);
    if (c !== -1) return (wordPosition << 5) + c;
  }
  return -1;
};

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

const bitIntersect = (bitset, other) => {
  bitset[0] &= other[0];
  bitset[1] &= other[1];
  bitset[2] &= other[2];
  bitset[3] &= other[3];
  bitset[4] &= other[4];
  bitset[5] &= other[5];
  bitset[6] &= other[6];
  bitset[7] &= other[7];
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
      // Because a pact might compress an entire segment within a node below it,
      // we need to make sure that our current node is actually inside that
      // segment and not in a segment below it.
      if (SEGMENT_LUT[depth] === SEGMENT_LUT[node.branchDepth]) {
        return node.segmentCount;
      } else {
        return 1;
      }
    }

    peek() {
      const depth = DEPTH_MAPPING[this.depth];
      if ((depth & 0b10000000) !== 0) {
        return 0;
      }
      const node = this.pathNodes[depth];
      if (node !== null && depth < node.branchDepth) {
        this.pathNodes[depth + 1] = node;
        return node.key[depth];
      } else {
        return null;
      }
    }

    propose(bitset) {
      let depth = DEPTH_MAPPING[this.depth];
      if ((depth & 0b10000000) !== 0) {
        unsetAllBit(bitset);
        setBit(bitset, 0);
      } else {
        depth &= 0b01111111;
        const node = this.pathNodes[depth];
        if (node === null) {
          unsetAllBit(bitset);
        } else {
          node.propose(depth, bitset);
        }
      }
    }

    pop() {
      //if (this.depth === 0) throw Error("Can't pop below start.");
      this.depth--;
    }

    push(byte) {
      let depth = DEPTH_MAPPING[this.depth];
      this.depth++;
      if ((depth & 0b10000000) === 0) {
        depth &= 0b01111111;
        const node = this.pathNodes[depth].get(depth, byte);
        if (node === undefined && node == null)
          throw Error("Nothing to push to.");
        this.pathNodes[depth + 1] = node;
      }
    }
  };

  function _union(leftNode, rightNode, depth = 0) {
    if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
      return leftNode;
    }
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    let branchDepth = depth;
    for (; branchDepth < maxDepth; branchDepth++) {
      if (leftNode.key[branchDepth] !== rightNode.key[branchDepth]) break;
    }
    if (branchDepth === KEY_LENGTH) return leftNode;

    const childbits = new Uint32Array(8);
    const children = [];
    let hash = new Uint8Array(16);
    let segmentCount = 0;

    let [leftIndex, leftChild] = leftNode.seek(branchDepth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(branchDepth, 0, true);
    search: while (true) {
      if (leftChild === null && rightChild === null) break search;

      if (
        leftChild !== null &&
        (rightChild === null || leftIndex < rightIndex)
      ) {
        setBit(childbits, leftIndex);
        children[leftIndex] = leftChild;
        hash = hash_combine(hash, leftChild.hash);
        segmentCount =
          SEGMENT_LUT[branchDepth] === SEGMENT_LUT[leftChild.branchDepth]
            ? segmentCount + leftChild.segmentCount
            : segmentCount + 1;
        [leftIndex, leftChild] = leftNode.seek(
          branchDepth,
          leftIndex + 1,
          true
        );
        continue search;
      }

      if (
        rightChild !== null &&
        (leftChild === null || rightIndex < leftIndex)
      ) {
        setBit(childbits, rightIndex);
        children[rightIndex] = rightChild;
        hash = hash_combine(hash, rightChild.hash);
        segmentCount =
          SEGMENT_LUT[branchDepth] === SEGMENT_LUT[rightChild.branchDepth]
            ? segmentCount + rightChild.segmentCount
            : segmentCount + 1;
        [rightIndex, rightChild] = rightNode.seek(
          branchDepth,
          rightIndex + 1,
          true
        );
        continue search;
      }

      //implicit leftIndex === rightIndex
      const union = _union(leftChild, rightChild, branchDepth + 1);
      setBit(childbits, leftIndex);
      children[leftIndex] = union;
      hash = hash_combine(hash, union.hash);
      segmentCount =
        SEGMENT_LUT[branchDepth] === SEGMENT_LUT[union.branchDepth]
          ? segmentCount + union.segmentCount
          : segmentCount + 1;

      const nextIndex = leftIndex + 1;
      [leftIndex, leftChild] = leftNode.seek(branchDepth, nextIndex, true);
      [rightIndex, rightChild] = rightNode.seek(branchDepth, nextIndex, true);
    }
    return new PACTNode(
      leftNode.key,
      branchDepth,
      childbits,
      children,
      hash,
      segmentCount,
      {}
    );
  }

  function _subtract(leftNode, rightNode, depth = 0) {
    if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH)
      return null;
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    let branchDepth = depth;
    for (; branchDepth < maxDepth; branchDepth++) {
      if (leftNode.key[branchDepth] !== rightNode.key[branchDepth]) {
        return leftNode;
      }
    }
    if (branchDepth === KEY_LENGTH) return null;

    const children = [];
    const childbits = new Uint32Array(8);
    let segmentCount = 0;
    let hash = new Uint8Array(16);

    let [leftIndex, leftChild] = leftNode.seek(branchDepth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
    search: while (true) {
      if (leftChild === null) break search;

      if (rightChild === null || leftIndex < rightIndex) {
        setBit(childbits, leftIndex);
        children[leftIndex] = leftChild;
        hash = hash_combine(hash, leftChild.hash);
        segmentCount =
          SEGMENT_LUT[branchDepth] === SEGMENT_LUT[leftChild.branchDepth]
            ? segmentCount + leftChild.segmentCount
            : segmentCount + 1;
        [leftIndex, leftChild] = leftNode.seek(
          branchDepth,
          leftIndex + 1,
          true
        );
        continue search;
      }

      if (rightIndex < leftIndex) {
        [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
        continue search;
      }

      //implicit leftIndex === rightIndex
      const diff = _subtract(leftChild, rightChild, branchDepth + 1);
      if (diff !== null) {
        setBit(childbits, leftIndex);
        children[leftIndex] = diff;
        hash = hash_combine(hash, diff.hash);
        segmentCount =
          SEGMENT_LUT[branchDepth] === SEGMENT_LUT[diff.branchDepth]
            ? segmentCount + diff.segmentCount
            : segmentCount + 1;
      }

      [leftIndex, leftChild] = leftNode.seek(branchDepth, leftIndex + 1, true);
      [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
    }
    if (noBit(childbits)) return null;
    return new PACTNode(
      leftNode.key,
      branchDepth,
      childbits,
      children,
      hash,
      segmentCount,
      {}
    );
  }

  function _intersect(leftNode, rightNode, depth = 0) {
    if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
      return leftNode;
    }
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    let branchDepth = depth;
    for (; branchDepth < maxDepth; branchDepth++) {
      if (leftNode.key[branchDepth] !== rightNode.key[branchDepth]) return null;
    }
    if (branchDepth === KEY_LENGTH) return leftNode;

    const childbits = new Uint32Array(8);
    const children = [];
    let hash = new Uint8Array(16);
    let segmentCount = 0;

    let [leftIndex, leftChild] = leftNode.seek(branchDepth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
    search: while (true) {
      if (leftChild === null || rightChild === null) break search;

      if (leftIndex < rightIndex) {
        [leftIndex, leftChild] = leftNode.seek(branchDepth, rightIndex, true);
        continue search;
      }

      if (rightIndex < leftIndex) {
        [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
        continue search;
      }

      //implicit leftIndex === rightIndex
      const intersection = _intersect(leftChild, rightChild, branchDepth + 1);
      if (intersection !== null) {
        setBit(childbits, leftIndex);
        children[leftIndex] = intersection;
        hash = hash_combine(hash, intersection.hash);
        segmentCount =
          SEGMENT_LUT[branchDepth] === SEGMENT_LUT[intersection.branchDepth]
            ? segmentCount + intersection.segmentCount
            : segmentCount + 1;
      }
      [leftIndex, leftChild] = leftNode.seek(branchDepth, leftIndex + 1, true);
      [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
    }
    if (noBit(childbits)) return null;
    return new PACTNode(
      leftNode.key,
      branchDepth,
      childbits,
      children,
      hash,
      segmentCount,
      {}
    );
  }

  function _difference(leftNode, rightNode, depth = 0) {
    if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH)
      return null;
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    let branchDepth = depth;
    for (; branchDepth < maxDepth; branchDepth++) {
      if (leftNode.key[branchDepth] !== rightNode.key[branchDepth]) break;
    }
    if (branchDepth === KEY_LENGTH) return null;

    const childbits = new Uint32Array(8);
    const children = [];
    let hash = new Uint8Array(16);
    let segmentCount = 0;

    let [leftIndex, leftChild] = leftNode.seek(branchDepth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(branchDepth, 0, true);
    search: while (true) {
      if (leftChild === null && rightChild === null) break search;

      if (
        leftChild !== null &&
        (rightChild === null || leftIndex < rightIndex)
      ) {
        setBit(childbits, leftIndex);
        children[leftIndex] = leftChild;
        hash = hash_combine(hash, leftChild.hash);
        segmentCount =
          SEGMENT_LUT[branchDepth] === SEGMENT_LUT[leftChild.branchDepth]
            ? segmentCount + leftChild.segmentCount
            : segmentCount + 1;
        [leftIndex, leftChild] = leftNode.seek(
          branchDepth,
          leftIndex + 1,
          true
        );
        continue search;
      }

      if (
        rightChild !== null &&
        (leftChild === null || rightIndex < leftIndex)
      ) {
        setBit(childbits, rightIndex);
        children[rightIndex] = rightChild;
        hash = hash_combine(hash, rightChild.hash);
        segmentCount =
          SEGMENT_LUT[branchDepth] === SEGMENT_LUT[rightChild.branchDepth]
            ? segmentCount + rightChild.segmentCount
            : segmentCount + 1;
        [rightIndex, rightChild] = rightNode.seek(
          branchDepth,
          rightIndex + 1,
          true
        );
        continue search;
      }

      //implicit leftIndex === rightIndex
      const difference = _difference(leftChild, rightChild, branchDepth + 1);
      if (difference !== null) {
        setBit(childbits, leftIndex);
        children[leftIndex] = difference;
        hash = hash_combine(hash, difference.hash);
        segmentCount =
          SEGMENT_LUT[branchDepth] === SEGMENT_LUT[difference.branchDepth]
            ? segmentCount + difference.segmentCount
            : segmentCount + 1;
      }

      const nextIndex = leftIndex + 1;
      [leftIndex, leftChild] = leftNode.seek(branchDepth, nextIndex, true);
      [rightIndex, rightChild] = rightNode.seek(branchDepth, nextIndex, true);
    }
    if (noBit(childbits)) return null;

    return new PACTNode(
      leftNode.key,
      branchDepth,
      childbits,
      children,
      hash,
      segmentCount,
      {}
    );
  }

  function _isSubsetOf(leftNode, rightNode, depth = 0) {
    if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH)
      return true;
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    let branchDepth = depth;
    for (; branchDepth < maxDepth; branchDepth++) {
      if (leftNode.key[branchDepth] !== rightNode.key[branchDepth]) break;
    }
    if (branchDepth === KEY_LENGTH) return true;
    let [leftIndex, leftChild] = leftNode.seek(branchDepth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
    while (true) {
      if (leftChild === null) return true;

      if (
        leftChild !== null &&
        (rightChild === null || leftIndex < rightIndex)
      ) {
        return false;
      }

      // implicit leftIndex === rightIndex
      // as right always seeks after left, we can never have rightIndex < leftIndex
      if (!_isSubsetOf(leftChild, rightChild, branchDepth + 1)) {
        return false;
      }
      [leftIndex, leftChild] = leftNode.seek(branchDepth, leftIndex + 1, true);
      [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
    }
  }

  function _isIntersecting(leftNode, rightNode, depth = 0) {
    if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH)
      return true;
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    let branchDepth = depth;
    for (; branchDepth < maxDepth; branchDepth++) {
      if (leftNode.key[branchDepth] !== rightNode.key[branchDepth]) {
        return false;
      }
    }
    if (branchDepth === KEY_LENGTH) return true;

    let [leftIndex, leftChild] = leftNode.seek(branchDepth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
    search: while (true) {
      if (leftChild === null || rightChild === null) return false;

      if (leftIndex < rightIndex) {
        [leftIndex, leftChild] = leftNode.seek(branchDepth, rightIndex, true);
        continue search;
      }

      if (rightIndex < leftIndex) {
        [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
        continue search;
      }

      //implicit leftIndex === rightIndex
      if (_isIntersecting(leftChild, rightChild, branchDepth + 1)) {
        return true;
      }
      [leftIndex, leftChild] = leftNode.seek(branchDepth, leftIndex + 1, true);
      [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
    }
  }
  function _walkBuild(
    path_compare,
    branch_combine,
    primary_cursor,
    other_cursors,
    depth
  ) {
    let failed = false;
    let byte;
    let d = depth;
    let c = 0;
    fastpath: while (true) {
      if (d === 32) {
        yield;
        break;
      }

      c = 0;
      byte = primary_cursor.peek();
      if (byte === null) break fastpath;
      for (c = 1; c < other_cursors.length; c++) {
        const other_byte = cursors[c].peek();
        if (other_byte === null) break fastpath;
        if (path_compare(byte, other_byte)) {
          failed = true;
          break fastpath;
        }
      }

      binding[d] = byte;
      for (c of cursors) {
        c.push(byte);
      }
      d++;
    }

    if (d < 32 && !failed) {
      const bitset = new Uint32Array(8);
      if (0 < c) {
        setBit(bitset, byte);
      } else {
        bitset.fill(0xffffffff);
      }
      for (; c < cursors.length; c++) {
        cursors[c].propose(bitset);
      }
      for (const bit of bitIterator(bitset)) {
        for (c of cursors) {
          c.push(bit);
        }
        binding[d] = bit;
        yield * resolveSegment(shortcircuit, cursors, binding, d + 1);
        for (c of cursors) {
          c.pop();
        }
      }
    }

    for (; depth < d; d--) {
      for (c of cursors) {
        c.pop();
      }
    }

    return hasResult;
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
        this.child = new PACTLeaf(key, value, PACTHash(key));
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

    put(key, value = null) {
      if (this.child !== null) {
        const nchild = this.child.put(0, key, value, {});
        if (this.child === nchild) return this;
        return new PACTTree(nchild);
      }
      return new PACTTree(new PACTLeaf(key, value, PACTHash(key)));
    }
    get(key) {
      let found;
      let node = this.child;
      if (node === null) return undefined;
      for (let depth = 0; depth < KEY_LENGTH; depth++) {
        const sought = key[depth];
        [found, node] = node.seek(depth, sought, true);
        if (node === null || found !== sought) return undefined;
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

    // These are only convenience functions for js interop and no API requirement.
    *entries() {
      const cursor = this.cursor();
      const key = new Uint8Array(KEY_LENGTH);
      while (true) {
        cursor.seek(key);
        if (!cursor.peek(key)) return;
        yield [key.slice(), cursor.value()];
        if (!nextKey(key)) return;
      }
    }

    *keys() {
      const cursor = this.cursor();
      const key = new Uint8Array(KEY_LENGTH);
      while (true) {
        cursor.seek(key);
        if (!cursor.peek(key)) return;
        yield key.slice();
        if (!nextKey(key)) return;
      }
    }

    *values() {
      const cursor = this.cursor();
      const key = new Uint8Array(KEY_LENGTH);
      while (true) {
        cursor.seek(key);
        if (!cursor.peek(key)) return;
        yield cursor.value();
        if (!nextKey(key)) return;
      }
    }
  };

  PACTLeaf = class {
    constructor(key, value, hash) {
      this.key = key;
      this.value = value;
      this.hash = hash;
      this.segmentCount = 1;
      this.branchDepth = KEY_LENGTH;
    }
    propose(depth, bitset) {
      singleBitIntersect(bitset, this.key[depth]);
    }
    get(depth, v) {
      return this;
    }
    seek(depth, v, ascending) {
      const candidate = this.key[depth];
      if ((ascending && v <= candidate) || (!ascending && v >= candidate)) {
        return [candidate, this];
      }
      return [v, null];
    }
    put(depth, key, value, owner) {
      let branchDepth = depth;
      for (; branchDepth < this.branchDepth; branchDepth++) {
        if (this.key[branchDepth] !== key[branchDepth]) break;
      }

      if (branchDepth === this.branchDepth) {
        return this;
      }

      const nchild = new PACTLeaf(key, value, PACTHash(key));

      const nchildren = [];
      const lindex = this.key[branchDepth];
      const rindex = key[branchDepth];
      nchildren[lindex] = this;
      nchildren[rindex] = nchild;
      const nchildbits = new Uint32Array(8);
      setBit(nchildbits, lindex);
      setBit(nchildbits, rindex);
      const hash = hash_combine(this.hash, nchild.hash);

      return new PACTNode(
        this.key,
        branchDepth,
        nchildbits,
        nchildren,
        hash,
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
      segmentCount,
      owner
    ) {
      this.key = key;
      this.branchDepth = branchDepth;
      this.childbits = childbits;
      this.children = children;
      this.hash = hash;
      this.segmentCount = segmentCount;
      this.owner = owner;
    }

    propose(depth, bitset) {
      if (depth > this.branchDepth) throw Error("Invalid depth.");
      if (depth < this.branchDepth) {
        singleBitIntersect(bitset, this.key[depth]);
      } else {
        bitIntersect(bitset, this.childbits);
      }
    }

    get(depth, v) {
      if (depth > this.branchDepth) throw Error("Invalid depth.");
      if (depth === this.branchDepth) {
        return this.children[v];
      } else {
        return this;
      }
    }
    seek(depth, v, ascending) {
      if (depth === this.branchDepth) {
        if (ascending) {
          const next = nextBit(this.childbits, v);
          if (next !== 256) {
            return [next, this.children[next]];
          }
        } else {
          const prev = prevBit(this.childbits, v);
          if (prev !== -1) {
            return [prev, this.children[prev]];
          }
        }
      } else {
        const candidate = this.key[depth];
        if ((ascending && v <= candidate) || (!ascending && v >= candidate)) {
          return [candidate, this];
        }
      }
      return [v, null];
    }
    put(depth, key, value, owner) {
      let branchDepth = depth;
      for (; branchDepth < this.branchDepth; branchDepth++) {
        if (this.key[branchDepth] !== key[branchDepth]) break;
      }

      if (branchDepth === this.branchDepth) {
        const pos = key[this.branchDepth];
        const childDepth = this.branchDepth + 1;
        let nchildbits;
        let nchild;
        let hash;
        let segmentCount;
        if (hasBit(this.childbits, pos)) {
          const child = this.children[pos];
          //We need to update the child where this key would belong.
          const oldChildHash = child.hash;
          const oldChildBranchDepth = child.branchDepth;
          const oldChildCount = child.segmentCount;
          nchild = child.put(childDepth, key, value, owner);
          if (hash_equal(oldChildHash, nchild.hash)) return this;
          hash = hash_update(this.hash, oldChildHash, nchild.hash);
          segmentCount = this.segmentCount;
          segmentCount -=
            SEGMENT_LUT[this.branchDepth] === SEGMENT_LUT[oldChildBranchDepth]
              ? oldChildCount
              : 1;
          segmentCount +=
            SEGMENT_LUT[this.branchDepth] === SEGMENT_LUT[nchild.branchDepth]
              ? nchild.segmentCount
              : 1;
          if (segmentCount < 0) {
            throw Error("Failed assertion: Bad segment count.");
          }
          if (this.owner === owner) {
            this.children[pos] = nchild;
            this.hash = hash;
            this.segmentCount = segmentCount;
            return this;
          }
          nchildbits = this.childbits.slice();
        } else {
          nchild = new PACTLeaf(key, value, PACTHash(key));
          hash = hash_combine(this.hash, nchild.hash);
          segmentCount = this.segmentCount + 1;
          if (this.owner === owner) {
            setBit(this.childbits, pos);
            this.children[pos] = nchild;
            this.hash = hash;
            this.segmentCount = segmentCount;
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
          segmentCount,
          owner
        );
      }

      const nchild = new PACTLeaf(key, value, PACTHash(key));

      const nchildren = [];
      const lindex = this.key[branchDepth];
      const rindex = key[branchDepth];
      nchildren[lindex] = this;
      nchildren[rindex] = nchild;
      const nchildbits = new Uint32Array(8);
      setBit(nchildbits, lindex);
      setBit(nchildbits, rindex);
      const segmentCount =
        SEGMENT_LUT[branchDepth] === SEGMENT_LUT[this.branchDepth]
          ? this.segmentCount + 1
          : 1;
      const hash = hash_combine(this.hash, nchild.hash);

      return new PACTNode(
        this.key,
        branchDepth,
        nchildbits,
        nchildren,
        hash,
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
  nextKey,
  PACTHash,
  bitIterator,
  singleBitIntersect,
  bitIntersect,
  setBit,
  unsetAllBit,
  setAllBit,
};
