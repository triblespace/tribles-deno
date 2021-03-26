import { SEGMENT_SIZE, TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";
import { XXH3_128 } from "./xxh128.js";

// Perstistent Adaptive Cuckoo Trie (PACT)

//TODO Variadic set operations that use cursor jumping for more efficiency on multiple inputs.
//This implementation is limited to keys with 16<= key.length <= 64.

const SESSION_SEED = [...crypto.getRandomValues(new Uint32Array(16))].reduce(
  (acc, v, i) => acc | (BigInt(v) << BigInt(i * 4)),
  0n,
);
function PACTHash(key) {
  if (key.__cached_XXH3_128 === undefined) {
    key.__cached_XXH3_128 = XXH3_128(key, SESSION_SEED);
  }
  return key.__cached_XXH3_128;
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

const setBit = (bitmap, bitPosition) => {
  bitmap[bitPosition >>> 5] |= highBit32 >>> bitPosition;
};

const hasBit = (bitmap, bitPosition) => {
  return (bitmap[bitPosition >>> 5] & (highBit32 >>> bitPosition)) !== 0;
};

const nextBit = (bitmap, bitPosition) => {
  let wordPosition = bitPosition >>> 5;
  const c = Math.clz32(bitmap[wordPosition] & (-1 >>> (bitPosition & 0b11111)));
  if (c !== 32) return (wordPosition << 5) + c;
  for (wordPosition++; wordPosition < 8; wordPosition++) {
    const c = Math.clz32(bitmap[wordPosition]);
    if (c !== 32) return (wordPosition << 5) + c;
  }
  return 256;
};

const prevBit = (bitmap, bitPosition) => {
  let wordPosition = bitPosition >>> 5;
  const c = 31 -
    ctz32(bitmap[wordPosition] & (-1 << (31 - (bitPosition & 0b11111))));
  if (c !== -1) return (wordPosition << 5) + c;
  for (wordPosition--; 0 <= wordPosition; wordPosition--) {
    const c = 31 - ctz32(bitmap[wordPosition]);
    if (c !== -1) return (wordPosition << 5) + c;
  }
  return -1;
};

const noBit = (bitmap) =>
  !(
    bitmap[0] ||
    bitmap[1] ||
    bitmap[2] ||
    bitmap[3] ||
    bitmap[4] ||
    bitmap[5] ||
    bitmap[6] ||
    bitmap[7]
  );

const makePACT = function (SEGMENTS) {
  const KEY_LENGTH = SEGMENTS.reduce((a, n) => a + n, 0);
  const SEGMENT_LUT = SEGMENTS.flatMap((l, i) => new Array(l).fill(i));
  const SEGMENT_PREFIXES = SEGMENTS.reduce(
    (a, n) => [...a, a[a.length - 1] + n],
    [0],
  );

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
      this.order = new Array(SEGMENTS.length + 1).fill(true);
      this.depth = 0;
      this.valid = true;
      this.path = new Uint8Array(KEY_LENGTH);
      this.pathNodes = new Array(KEY_LENGTH + 1);

      if (pact.child === null) {
        this.valid = false;
        return;
      }
      this.pathNodes[0] = pact.child;
    }
    countSubsegment() {
      const prefixLen = SEGMENT_PREFIXES[this.depth];
      const node = this.path[prefixLen];
      if (SEGMENT_LUT[prefixLen] === SEGMENT_LUT[node.branchDepth]) {
        node.segmentCount;
      } else {
        return 1;
      }
    }
    peek() {
      const start = SEGMENT_PREFIXES[this.depth];
      const end = SEGMENT_PREFIXES[this.depth + 1];
      return this.path.slice(start, end);
    }
    value() {
      const end = SEGMENT_PREFIXES[this.depth + 1];
      return this.pathNodes[end].value;
    }
    next() {
      if (this.valid) {
        const ascending = this.order[this.depth];
        const prefixLen = SEGMENT_PREFIXES[this.depth];
        const searchDepth = SEGMENT_PREFIXES[this.depth + 1];
        let depth = searchDepth - 1;
        for (; prefixLen <= depth; depth--) {
          let node;
          [this.path[depth], node] = this.pathNodes[depth].seek(
            depth,
            this.path[depth] + (ascending ? +1 : -1),
            ascending,
          );
          this.pathNodes[depth + 1] = node;
          if (node !== null) break;
        }
        if (depth < prefixLen) {
          this.valid = false;
          return;
        }
        for (depth++; depth < searchDepth; depth++) {
          [this.path[depth], this.pathNodes[depth + 1]] = this.pathNodes[
            depth
          ].seek(depth, ascending ? 0 : 255, ascending);
        }
      }
    }
    seek(infix) {
      if (this.valid) {
        const ascending = this.order[this.depth];
        const prefixLen = SEGMENT_PREFIXES[this.depth];
        const searchDepth = SEGMENT_PREFIXES[this.depth + 1];
        let depth = prefixLen;
        search:
        for (; depth < searchDepth; depth++) {
          const sought = infix[depth - prefixLen];
          let node;
          [this.path[depth], node] = this.pathNodes[depth].seek(
            depth,
            sought,
            ascending,
          );
          this.pathNodes[depth + 1] = node;
          if (node === null) {
            backtrack:
            for (depth--; prefixLen <= depth; depth--) {
              let node;
              [this.path[depth], node] = this.pathNodes[depth].seek(
                depth,
                this.path[depth] + (ascending ? +1 : -1),
                ascending,
              );
              this.pathNodes[depth + 1] = node;
              if (node !== null) break backtrack;
            }
            if (depth < prefixLen) {
              this.valid = false;
              return false;
            }
            break search;
          }
          if (this.path[depth] !== sought) break search;
        }
        if (depth === searchDepth) {
          return true;
        }
        for (depth++; depth < searchDepth; depth++) {
          [this.path[depth], this.pathNodes[depth + 1]] = this.pathNodes[
            depth
          ].seek(depth, ascending ? 0 : 255, ascending);
        }
        return false;
      }
    }
    push(ascending = true) {
      if (this.depth === SEGMENTS.length) {
        throw Error("Can't push cursor beyond key length.");
      }
      this.depth++;
      const newPrefix = SEGMENT_PREFIXES[this.depth];
      const searchDepth = SEGMENT_PREFIXES[this.depth + 1];
      this.order[this.depth](ascending);

      for (let depth = newPrefix; depth < searchDepth; depth++) {
        [this.path[depth], this.pathNodes[depth + 1]] = this.pathNodes[
          depth
        ].seek(depth, ascending ? 0 : 255, ascending);
      }
      return this;
    }
    pop() {
      if (this.depth == 0) {
        throw Error("Can't pop cursor beyond key start.");
      }
      this.depth--;
      this.valid = true;
      return this;
    }
  };

  function _union(leftNode, rightNode, depth = 0) {
    if (leftNode.hash === rightNode.hash || depth === KEY_LENGTH) {
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
    let hash = 0n;
    let segmentCount = 0;

    let [leftIndex, leftChild] = leftNode.seek(branchDepth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(branchDepth, 0, true);
    search:
    while (true) {
      if (leftChild === null && rightChild === null) break search;

      if (
        leftChild !== null &&
        (rightChild === null || leftIndex < rightIndex)
      ) {
        setBit(childbits, leftIndex);
        children[leftIndex] = leftChild;
        hash = hash ^ leftChild.hash;
        segmentCount = segmentCount +
            (SEGMENT_LUT[branchDepth] === SEGMENT_LUT[leftChild.branchDepth])
          ? leftChild.segmentCount
          : 1;
        [leftIndex, leftChild] = leftNode.seek(
          branchDepth,
          leftIndex + 1,
          true,
        );
        continue search;
      }

      if (
        rightChild !== null &&
        (leftChild === null || rightIndex < leftIndex)
      ) {
        setBit(childbits, rightIndex);
        children[rightIndex] = rightChild;
        hash = hash ^ rightChild.hash;
        segmentCount = segmentCount +
            (SEGMENT_LUT[branchDepth] === SEGMENT_LUT[rightChild.branchDepth])
          ? rightChild.segmentCount
          : 1;
        [rightIndex, rightChild] = rightNode.seek(
          branchDepth,
          rightIndex + 1,
          true,
        );
        continue search;
      }

      //implicit leftIndex === rightIndex
      const union = _union(leftChild, rightChild, branchDepth + 1);
      setBit(childbits, leftIndex);
      children[leftIndex] = union;
      hash = hash ^ union.hash;
      segmentCount = segmentCount +
          (SEGMENT_LUT[branchDepth] === SEGMENT_LUT[union.branchDepth])
        ? union.segmentCount
        : 1;

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
      {},
    );
  }

  function _subtract(leftNode, rightNode, depth = 0) {
    if (leftNode.hash === rightNode.hash || depth === KEY_LENGTH) return null;
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    let branchDepth = depth;
    for (; branchDepth < maxDepth; branchDepth++) {
      if (leftNode.key[branchDepth] !== rightNode.key[branchDepth]) {
        return leftNode;
      }
    }
    if (branchDepth === KEY_LENGTH) return null;

    const children = [];
    let childbits = new Uint32Array(8);
    let segmentCount = 0;
    let hash = 0n;

    let [leftIndex, leftChild] = leftNode.seek(branchDepth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
    search:
    while (true) {
      if (leftChild === null) break search;

      if (rightChild === null || leftIndex < rightIndex) {
        setBit(childbits, leftIndex);
        children[leftIndex] = leftChild;
        hash = hash ^ leftChild.hash;
        segmentCount = segmentCount +
            (SEGMENT_LUT[branchDepth] === SEGMENT_LUT[leftChild.branchDepth])
          ? leftChild.segmentCount
          : 1;
        [leftIndex, leftChild] = leftNode.seek(
          branchDepth,
          leftIndex + 1,
          true,
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
        hash = hash ^ diff.hash;
        segmentCount = segmentCount +
            (SEGMENT_LUT[branchDepth] === SEGMENT_LUT[diff.branchDepth])
          ? diff.segmentCount
          : 1;
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
      {},
    );
  }

  function _intersect(leftNode, rightNode, depth = 0) {
    if (leftNode.hash === rightNode.hash || depth === KEY_LENGTH) {
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
    let hash = 0n;
    let segmentCount = 0;

    let [leftIndex, leftChild] = leftNode.seek(branchDepth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(branchDepth, leftIndex, true);
    search:
    while (true) {
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
        hash = hash ^ intersection.hash;
        segmentCount = segmentCount +
            (SEGMENT_LUT[branchDepth] === SEGMENT_LUT[intersection.branchDepth])
          ? intersection.segmentCount
          : 1;
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
      {},
    );
  }

  function _difference(leftNode, rightNode, depth = 0) {
    if (leftNode.hash === rightNode.hash || depth === KEY_LENGTH) return null;
    const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
    let branchDepth = depth;
    for (; branchDepth < maxDepth; branchDepth++) {
      if (leftNode.key[branchDepth] !== rightNode.key[branchDepth]) break;
    }
    if (branchDepth === KEY_LENGTH) return null;

    const childbits = new Uint32Array(8);
    const children = [];
    let hash = 0n;
    let segmentCount = 0;

    let [leftIndex, leftChild] = leftNode.seek(branchDepth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(branchDepth, 0, true);
    search:
    while (true) {
      if (leftChild === null && rightChild === null) break search;

      if (
        leftChild !== null &&
        (rightChild === null || leftIndex < rightIndex)
      ) {
        setBit(childbits, leftIndex);
        children[leftIndex] = leftChild;
        hash = hash ^ leftChild.hash;
        segmentCount = segmentCount +
            (SEGMENT_LUT[branchDepth] === SEGMENT_LUT[leftChild.branchDepth])
          ? leftChild.segmentCount
          : 1;
        [leftIndex, leftChild] = leftNode.seek(
          branchDepth,
          leftIndex + 1,
          true,
        );
        continue search;
      }

      if (
        rightChild !== null &&
        (leftChild === null || rightIndex < leftIndex)
      ) {
        setBit(childbits, rightIndex);
        children[rightIndex] = rightChild;
        hash = hash ^ rightChild.hash;
        segmentCount = segmentCount +
            (SEGMENT_LUT[branchDepth] === SEGMENT_LUT[rightChild.branchDepth])
          ? rightChild.segmentCount
          : 1;
        [rightIndex, rightChild] = rightNode.seek(
          branchDepth,
          rightIndex + 1,
          true,
        );
        continue search;
      }

      //implicit leftIndex === rightIndex
      const difference = _difference(leftChild, rightChild, branchDepth + 1);
      if (difference !== null) {
        setBit(childbits, leftIndex);
        children[leftIndex] = difference;
        hash = hash ^ difference.hash;
        segmentCount = segmentCount +
            (SEGMENT_LUT[branchDepth] === SEGMENT_LUT[difference.branchDepth])
          ? difference.segmentCount
          : 1;
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
      {},
    );
  }

  function _isSubsetOf(leftNode, rightNode, depth = 0) {
    if (leftNode.hash === rightNode.hash || depth === KEY_LENGTH) return true;
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
    if (leftNode.hash === rightNode.hash || depth === KEY_LENGTH) return true;
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
    search:
    while (true) {
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
          this.child.hash === other.child.hash)
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
          this.child.hash === other.child.hash ||
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
      if (this.child === null || this.child.hash === other.child.hash) {
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
      if (thisNode === otherNode || thisNode.hash === otherNode.hash) {
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
      if (thisNode === otherNode || thisNode.hash === otherNode.hash) {
        return new PACTTree(null);
      }
      return new PACTTree(_difference(thisNode, otherNode));
    }

    // These are only convenience functions for js interop and no API requirement.
    entries() {
      const cursor = this.cursor();
      if (cursor.valid) cursor.push(KEY_LENGTH);
      return {
        [Symbol.iterator]() {
          return this;
        },
        next() {
          if (!cursor.valid) return { done: true };
          const key = cursor.peek();
          const value = cursor.value();
          cursor.next();
          return { value: [key, value] };
        },
      };
    }

    keys() {
      const cursor = this.cursor();
      if (cursor.valid) cursor.push(KEY_LENGTH);
      return {
        [Symbol.iterator]() {
          return this;
        },
        next() {
          if (!cursor.valid) return { done: true };
          const key = cursor.peek();
          cursor.next();
          return { value: key };
        },
      };
    }

    values() {
      const cursor = this.cursor();
      if (cursor.valid) cursor.push(KEY_LENGTH);
      return {
        [Symbol.iterator]() {
          return this;
        },
        next() {
          if (!cursor.valid) return { done: true };
          const value = cursor.value();
          cursor.next();
          return { value };
        },
      };
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
      const segmentCount =
        (SEGMENT_LUT[branchDepth] === SEGMENT_LUT[this.branchDepth])
          ? this.segmentCount + 1
          : 1;
      const hash = this.hash ^ nchild.hash;

      return new PACTNode(
        this.key,
        branchDepth,
        nchildbits,
        nchildren,
        hash,
        segmentCount,
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
      segmentCount,
      owner,
    ) {
      this.key = key;
      this.branchDepth = branchDepth;
      this.childbits = childbits;
      this.children = children;
      this.hash = hash;
      this.segmentCount = segmentCount;
      this.owner = owner;
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
          nchild = child.put(childDepth, key, value, owner);
          if (child.hash === nchild.hash) return this;
          hash = this.hash ^ child.hash ^ nchild.hash;
          segmentCount =
            (SEGMENT_LUT[this.branchDepth] === SEGMENT_LUT[child.branchDepth])
              ? this.segmentCount - child.segmentCount + nchild.segmentCount
              : this.segmentCount;
          if (this.owner === owner) {
            this.children[pos] = nchild;
            this.hash = hash;
            this.segmentCount = segmentCount;
            return this;
          }
          nchildbits = this.childbits.slice();
        } else {
          nchild = new PACTLeaf(key, value, PACTHash(key));
          hash = this.hash ^ nchild.hash;
          segmentCount = this.segmentCount +
              (SEGMENT_LUT[this.branchDepth] ===
                SEGMENT_LUT[nchild.branchDepth])
            ? nchild.segmentCount
            : 1;
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
          owner,
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
        (SEGMENT_LUT[branchDepth] === SEGMENT_LUT[this.branchDepth])
          ? this.segmentCount + 1
          : 1;
      const hash = this.hash ^ nchild.hash;

      return new PACTNode(
        this.key,
        branchDepth,
        nchildbits,
        nchildren,
        hash,
        segmentCount,
        owner,
      );
    }
  };

  return new PACTTree();
};

const emptyTriblePACT = makePACT(TRIBLE_SIZE, SEGMENT_SIZE);
const emptyValuePACT = makePACT(VALUE_SIZE, SEGMENT_SIZE);

export { emptyTriblePACT, emptyValuePACT, makePACT, PACTHash };
