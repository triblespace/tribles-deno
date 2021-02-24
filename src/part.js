import { SEGMENT_SIZE, TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";
import { XXH3_128 } from "./xxh128.js";

//This implementation is limited to keys with 16<= key.length <= 64.

const SESSION_SEED = [...crypto.getRandomValues(new Uint32Array(16))].reduce(
  (acc, v, i) => acc | (BigInt(v) << BigInt(i * 4)),
  0n,
);
function PARTHash(key) {
  if(!key.__cached_XXH3_128){
    key.__cached_XXH3_128 = XXH3_128(key, SESSION_SEED);
  }
  return key.__cached_XXH3_128;
}

const makePART = function (KEY_LENGTH, SEGMENT_LENGTH) {
  if (KEY_LENGTH % SEGMENT_LENGTH !== 0) {
    throw Error("Key length must be multiple of segment length.");
  }
  const linearNodeSize = 16;
  const indirectNodeSize = 64;

  // deno-lint-ignore prefer-const
  let PARTCursor;
  // deno-lint-ignore prefer-const
  let PARTree;
  // deno-lint-ignore prefer-const
  let PARTBatch;
  // deno-lint-ignore prefer-const
  let PARTLeaf;
  // deno-lint-ignore prefer-const
  let PARTPathNode;
  // deno-lint-ignore prefer-const
  let PARTLinearNode;
  // deno-lint-ignore prefer-const
  let PARTIndirectNode;
  // deno-lint-ignore prefer-const
  let PARTDirectNode;

  PARTCursor = class {
    constructor(part) {
      this.part = part;
      this.prefixStack = [0];
      this.infixStack = [0];
      this.orderStack = [];
      this.valid = true;
      this.path = new Uint8Array(KEY_LENGTH);
      this.pathNodes = new Array(KEY_LENGTH + 1);

      if (!part.child) {
        this.valid = false;
        return;
      }
      this.pathNodes[0] = part.child;
    }
    countSubsegments() {
      const prefixLen = this.prefixStack[this.prefixStack.length - 1];
      const infixLen = this.infixStack[this.infixStack.length - 1];
      const searchDepth = prefixLen + infixLen;
      this.path[searchDepth].segmentCount;
    }
    peek() {
      const infixLen = this.infixStack[this.infixStack.length - 1];
      const prefixLen = this.prefixStack[this.prefixStack.length - 1];
      return this.path.slice(prefixLen, prefixLen + infixLen);
    }
    value() {
      const infixLen = this.infixStack[this.infixStack.length - 1];
      const prefixLen = this.prefixStack[this.prefixStack.length - 1];
      return this.pathNodes[prefixLen + infixLen].value;
    }
    next() {
      if (this.valid) {
        const ascending = this.orderStack[this.orderStack.length - 1];
        const prefixLen = this.prefixStack[this.prefixStack.length - 1];
        const infixLen = this.infixStack[this.infixStack.length - 1];
        const searchDepth = prefixLen + infixLen;
        let depth = searchDepth - 1;
        for (; prefixLen <= depth; depth--) {
          let node;
          [this.path[depth], node] = this.pathNodes[depth].seek(
            depth,
            this.path[depth] + (ascending ? +1 : -1),
            ascending,
          );
          this.pathNodes[depth + 1] = node;
          if (node) break;
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
        const ascending = this.orderStack[this.orderStack.length - 1];
        const prefixLen = this.prefixStack[this.prefixStack.length - 1];
        const infixLen = this.infixStack[this.infixStack.length - 1];
        const searchDepth = prefixLen + infixLen;
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
          if (!node) {
            backtrack:
            for (depth--; prefixLen <= depth; depth--) {
              let node;
              [this.path[depth], node] = this.pathNodes[depth].seek(
                depth,
                this.path[depth] + (ascending ? +1 : -1),
                ascending,
              );
              this.pathNodes[depth + 1] = node;
              if (node) break backtrack;
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
    push(infixLen, ascending = true) {
      if (infixLen % SEGMENT_LENGTH !== 0) {
        throw Error("Infix length must be multiple of Segment size.");
      }
      const newPrefix = this.prefixStack[this.prefixStack.length - 1] +
        this.infixStack[this.infixStack.length - 1];
      if (KEY_LENGTH < newPrefix + infixLen) {
        throw Error("Can't push cursor beyond key length.");
      }
      this.prefixStack.push(newPrefix);
      this.infixStack.push(infixLen);
      this.orderStack.push(ascending);

      for (let depth = newPrefix; depth < newPrefix + infixLen; depth++) {
        [this.path[depth], this.pathNodes[depth + 1]] = this.pathNodes[
          depth
        ].seek(depth, ascending ? 0 : 255, ascending);
      }
    }
    pop() {
      this.orderStack.pop();
      this.prefixStack.pop();
      this.infixStack.pop();
      this.valid = true;
    }
  };

  function _makeNode(children, depth, hash) {
    const owner = {};

    const len = children.length;
    if (len === 0) {
      return null;
    }
    if (len === 1) {
      const [[index, child]] = children;
      if (child instanceof PARTPathNode) {
        if (
          child.depth <= depth && (index === child.path[depth - child.depth])
        ) {
          return child;
        }
        const path = new Uint8Array(child.path.length + 1);
        path[0] = index;
        path.set(child.path, 1);
        return new PARTPathNode(depth, path, child.child, owner);
      }
      const path = new Uint8Array(1);
      path[0] = index;
      return new PARTPathNode(depth, path, child, owner);
    }
    if (len < linearNodeSize) {
      const nindex = new Uint8Array(children.length);
      const nchildren = children.map(([index, child], i) => {
        nindex[i] = index;
        return child;
      });
      return new PARTLinearNode(nindex, nchildren, hash, owner);
    }
    if (len < indirectNodeSize) {
      const nindex = new Uint8Array(256);
      const nchildren = children.map(([index, child], i) => {
        nindex[index] = i + 1;
        return child;
      });
      return new PARTIndirectNode(nindex, nchildren, hash, owner);
    }
    const nchildren = new Array(256);
    for (let i = 0; i < children.length; i++) {
      const [index, child] = children[i];
      nchildren[index] = child;
    }
    return new PARTDirectNode(nchildren, hash, owner);
  }

  function _union(
    leftNode,
    rightNode,
    depth = 0,
  ) {
    const children = [];
    let hash = 0n;

    let [leftIndex, leftChild] = leftNode.seek(depth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(depth, 0, true);
    search:
    while (true) {
      if (!leftChild && !rightChild) break search;

      if (leftChild && (!rightChild || leftIndex < rightIndex)) {
        children.push([leftIndex, leftChild]);
        hash = hash ^ leftChild.hash;
        [leftIndex, leftChild] = leftNode.seek(
          depth,
          leftIndex + 1,
          true,
        );
        continue search;
      }

      if (rightChild && (!leftChild || rightIndex < leftIndex)) {
        children.push([rightIndex, rightChild]);
        hash = hash ^ rightChild.hash;
        [rightIndex, rightChild] = rightNode.seek(
          depth,
          rightIndex + 1,
          true,
        );
        continue search;
      }

      //implicit leftIndex === rightIndex
      if (
        (depth === (KEY_LENGTH - 1)) ||
        (leftChild.hash === rightChild.hash)
      ) {
        children.push([leftIndex, rightChild]);
        hash = hash ^ leftChild.hash;
      } else {
        const union = _union(leftChild, rightChild, depth + 1);
        children.push([leftIndex, union]);
        hash = hash ^ union.hash;
      }
      const nextIndex = leftIndex + 1;
      [leftIndex, leftChild] = leftNode.seek(depth, nextIndex, true);
      [rightIndex, rightChild] = rightNode.seek(depth, nextIndex, true);
    }
    return _makeNode(children, depth, hash);
  }

  function _subtract(
    leftNode,
    rightNode,
    depth = 0,
  ) {
    const children = [];
    let hash = 0n;

    let [leftIndex, leftChild] = leftNode.seek(depth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(depth, leftIndex, true);
    search:
    while (true) {
      if (!leftChild) break search;

      if (!rightChild || (leftIndex < rightIndex)) {
        children.push([leftIndex, leftChild]);
        hash = hash ^ leftChild.hash;
        [leftIndex, leftChild] = leftNode.seek(
          depth,
          leftIndex + 1,
          true,
        );
        continue search;
      }

      if (rightIndex < leftIndex) {
        [rightIndex, rightChild] = rightNode.seek(
          depth,
          leftIndex,
          true,
        );
        continue search;
      }

      //implicit leftIndex === rightIndex
      if (
        !(depth === (KEY_LENGTH - 1)) &&
        (leftChild.hash !== rightChild.hash)
      ) {
        const diff = _subtract(leftChild, rightChild, depth + 1);
        if (diff) {
          children.push([leftIndex, diff]);
          hash = hash ^ diff.hash;
        }
      }
      [leftIndex, leftChild] = leftNode.seek(depth, leftIndex + 1, true);
      [rightIndex, rightChild] = rightNode.seek(depth, leftIndex, true);
    }
    return _makeNode(children, depth, hash);
  }

  function _intersect(
    leftNode,
    rightNode,
    depth = 0,
  ) {
    const children = [];
    let hash = 0n;

    let [leftIndex, leftChild] = leftNode.seek(depth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(depth, leftIndex, true);
    search:
    while (true) {
      if (!leftChild || !rightChild) break search;

      if (leftIndex < rightIndex) {
        [leftIndex, leftChild] = leftNode.seek(
          depth,
          rightIndex,
          true,
        );
        continue search;
      }

      if (rightIndex < leftIndex) {
        [rightIndex, rightChild] = rightNode.seek(
          depth,
          leftIndex,
          true,
        );
        continue search;
      }

      //implicit leftIndex === rightIndex
      if (
        (depth === (KEY_LENGTH - 1)) ||
        (leftChild.hash === rightChild.hash)
      ) {
        children.push([leftIndex, leftChild]);
        hash = hash ^ leftChild.hash;
      } else {
        const intersection = _intersect(leftChild, rightChild, depth + 1);
        if (intersection) {
          children.push([leftIndex, intersection]);
          hash = hash ^ intersection.hash;
        }
      }
      [leftIndex, leftChild] = leftNode.seek(depth, leftIndex + 1, true);
      [rightIndex, rightChild] = rightNode.seek(depth, leftIndex, true);
    }
    return _makeNode(children, depth, hash);
  }

  function _difference(
    leftNode,
    rightNode,
    depth = 0,
  ) {
    const children = [];
    let hash = 0n;

    let [leftIndex, leftChild] = leftNode.seek(depth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(depth, 0, true);
    search:
    while (true) {
      if (!leftChild && !rightChild) break search;

      if (leftChild && (!rightChild || leftIndex < rightIndex)) {
        children.push([leftIndex, leftChild]);
        hash = hash ^ leftChild.hash;
        [leftIndex, leftChild] = leftNode.seek(
          depth,
          leftIndex + 1,
          true,
        );
        continue search;
      }

      if (rightChild && (!leftChild || rightIndex < leftIndex)) {
        children.push([rightIndex, rightChild]);
        hash = hash ^ rightChild.hash;
        [rightIndex, rightChild] = rightNode.seek(
          depth,
          rightIndex + 1,
          true,
        );
        continue search;
      }

      //implicit leftIndex === rightIndex
      if (
        (depth < (KEY_LENGTH - 1)) &&
        (leftChild.hash !== rightChild.hash)
      ) {
        const difference = _difference(leftChild, rightChild, depth + 1);
        if (difference) {
          children.push([leftIndex, difference]);
          hash = hash ^ difference.hash;
        }
      }
      const nextIndex = leftIndex + 1;
      [leftIndex, leftChild] = leftNode.seek(depth, nextIndex, true);
      [rightIndex, rightChild] = rightNode.seek(depth, nextIndex, true);
    }
    return _makeNode(children, depth, hash);
  }

  function _isSubsetOf(
    leftNode,
    rightNode,
    depth = 0,
  ) {
    let [leftIndex, leftChild] = leftNode.seek(depth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(depth, leftIndex, true);
    while (true) {
      if (!leftChild) return true;

      if (leftChild && (!rightChild || leftIndex < rightIndex)) {
        return false;
      }

      // implicit leftIndex === rightIndex
      // as right always seeks after left, we can never have rightIndex < leftIndex
      if (
        !(depth === (KEY_LENGTH - 1)) &&
        (leftChild.hash !== rightChild.hash) &&
        !_isSubsetOf(leftChild, rightChild, depth + 1)
      ) {
        return false;
      }
      [leftIndex, leftChild] = leftNode.seek(depth, leftIndex + 1, true);
      [rightIndex, rightChild] = rightNode.seek(depth, leftIndex, true);
    }
  }

  function _isIntersecting(
    leftNode,
    rightNode,
    depth = 0,
  ) {
    let [leftIndex, leftChild] = leftNode.seek(depth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(depth, leftIndex, true);
    search:
    while (true) {
      if (!leftChild || !rightChild) return false;

      if (leftIndex < rightIndex) {
        [leftIndex, leftChild] = leftNode.seek(
          depth,
          rightIndex,
          true,
        );
        continue search;
      }

      if (rightIndex < leftIndex) {
        [rightIndex, rightChild] = rightNode.seek(
          depth,
          leftIndex,
          true,
        );
        continue search;
      }

      //implicit leftIndex === rightIndex
      if (
        (depth === (KEY_LENGTH - 1)) ||
        (leftChild.hash === rightChild.hash)
      ) {
        return true;
      } else {
        if (_isIntersecting(leftChild, rightChild, depth + 1)) {
          return true;
        }
      }
      [leftIndex, leftChild] = leftNode.seek(depth, leftIndex + 1, true);
      [rightIndex, rightChild] = rightNode.seek(depth, leftIndex, true);
    }
  }

  PARTBatch = class {
    constructor(child) {
      this.child = child;
      this.owner = {};
      this.completed = false;
    }
    complete() {
      if (this.completed) throw Error("Batch already completed.");
      this.completed = true;
      return new PARTree(this.child);
    }
    put(key, value = null) {
      if (this.completed) {
        throw Error("Can't put into already completed batch.");
      }
      if (this.child) {
        this.child = this.child.put(0, key, value, this.owner);
      } else {
        const path = new Uint8Array(KEY_LENGTH);
        for (let i = 0; i < KEY_LENGTH; i++) {
          path[i] = key[i];
        }
        this.child = new PARTPathNode(
          0,
          path,
          new PARTLeaf(PARTHash(key), value),
          this.owner,
        );
      }
      return this;
    }
  };

  PARTree = class {
    constructor(child = null) {
      this.keyLength = KEY_LENGTH;
      this.child = child;
    }
    batch() {
      return new PARTBatch(this.child);
    }

    put(key, value = null) {
      const owner = {};

      if (this.child) {
        const nchild = this.child.put(0, key, value, owner);
        if (this.child === nchild) return this;
        return new PARTree(nchild);
      }
      const path = key.slice(0, KEY_LENGTH);
      return new PARTree(
        new PARTPathNode(
          0,
          path,
          new PARTLeaf(PARTHash(key), value),
          owner,
        ),
      );
    }
    get(key) {
      let found;
      let node = this.child;
      if (!node) return undefined;
      for (let depth = 0; depth < KEY_LENGTH; depth++) {
        const sought = key[depth];
        [found, node] = node.seek(depth, sought, true);
        if (!node || found !== sought) return undefined;
      }
      return node.value;
    }

    cursor() {
      return new PARTCursor(this);
    }

    isEmpty() {
      return this.child === null;
    }

    isEqual(other) {
      return this.child === other.child ||
        (this.keyLength === other.keyLength && !!this.child && !!other.child &&
          (this.child.hash === other.child.hash));
    }

    isSubsetOf(other) {
      return this.keyLength === other.keyLength &&
        (!this.child ||
          (!!other.child && _isSubsetOf(this.child, other.child)));
    }

    isIntersecting(other) {
      return this.keyLength === other.keyLength && !!this.child &&
        !!other.child &&
        ((this.child === other.child) ||
          (this.child.hash === other.child.hash) ||
          _isIntersecting(this.child, other.child));
    }

    union(other) {
      const thisNode = this.child;
      const otherNode = other.child;
      if (thisNode === null) {
        return new PARTree(otherNode);
      }
      if (otherNode === null) {
        return new PARTree(thisNode);
      }
      if (thisNode === otherNode || (thisNode.hash === otherNode.hash)) {
        return new PARTree(otherNode);
      }
      return new PARTree(_union(thisNode, otherNode));
    }

    subtract(other) {
      const thisNode = this.child;
      const otherNode = other.child;
      if (otherNode === null) {
        return new PARTree(thisNode);
      }
      if (this.child === null || (this.child.hash === other.child.hash)) {
        return new PARTree();
      } else {
        return new PARTree(_subtract(thisNode, otherNode));
      }
    }

    intersect(other) {
      const thisNode = this.child;
      const otherNode = other.child;

      if (thisNode === null || otherNode === null) {
        return new PARTree(null);
      }
      if (thisNode === otherNode || (thisNode.hash === otherNode.hash)) {
        return new PARTree(otherNode);
      }
      return new PARTree(_intersect(thisNode, otherNode));
    }

    difference(other) {
      const thisNode = this.child;
      const otherNode = other.child;

      if (thisNode === null) {
        return new PARTree(otherNode);
      }
      if (otherNode === null) {
        return new PARTree(thisNode);
      }
      if (thisNode === otherNode || (thisNode.hash === otherNode.hash)) {
        return new PARTree(null);
      }
      return new PARTree(_difference(thisNode, otherNode));
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

  PARTLeaf = class {
    constructor(hash, value) {
      this.hash = hash;
      this.value = value;
      this.segmentCount = 1;
    }

    put(depth, key, value, owner) {
      return this;
    }

    seek(depth, v, ascending) {
      throw new Error("Can't seek on PARTLeaf!");
    }
  };

  PARTPathNode = class {
    constructor(depth, path, child, owner) {
      this.depth = depth;
      this.path = path;
      this.child = child;
      this.owner = owner;

      this.hash = child.hash;

      this.segmentCount =
        (((depth % SEGMENT_LENGTH) + path.length) >= SEGMENT_LENGTH)
          ? 1
          : child.segmentCount;
    }
    seek(depth, v, ascending) {
      const candidate = this.path[depth - this.depth];
      if ((ascending && v <= candidate) || (!ascending && v >= candidate)) {
        if (depth === this.depth + this.path.length - 1) {
          return [candidate, this.child];
        }
        return [candidate, this];
      }
      return [v, null];
    }
    put(depth, key, value, owner) {
      let matchLength = 0;
      for (; matchLength < this.path.length; matchLength++) {
        if (this.path[matchLength] !== key[depth + matchLength]) break;
      }
      if (matchLength === this.path.length) {
        const nchild = this.child.put(
          depth + this.path.length,
          key,
          value,
          owner,
        );
        if (this.child === nchild) {
          return this;
        }

        if (this.owner === owner) {
          this.child = nchild;
          this.hash = nchild.hash;
          this.segmentCount =
            (((this.depth % SEGMENT_LENGTH) + this.path.length) >=
                SEGMENT_LENGTH)
              ? 1
              : nchild.segmentCount;
          return this;
        }
        return new PARTPathNode(depth, this.path, nchild, owner);
      }

      const keyRestLength = KEY_LENGTH - (depth + matchLength) - 1;
      const restLength = this.path.length - matchLength - 1;

      let lchild = this.child;
      let rchild = new PARTLeaf(PARTHash(key), value);

      const childDepth = depth + matchLength + 1;
      if (restLength !== 0) {
        const lpath = new Uint8Array(restLength);
        for (let i = 0; i < restLength; i++) {
          lpath[i] = this.path[this.path.length - restLength + i];
        }

        lchild = new PARTPathNode(
          childDepth,
          lpath,
          lchild,
          owner,
        );
      }
      if (keyRestLength !== 0) {
        const rpath = new Uint8Array(keyRestLength);
        for (let i = 0; i < keyRestLength; i++) {
          rpath[i] = key[KEY_LENGTH - keyRestLength + i];
        }

        rchild = new PARTPathNode(
          childDepth,
          rpath,
          rchild,
          owner,
        );
      }
      const forkDepth = depth + matchLength;
      const nindex = new Uint8Array(linearNodeSize);
      nindex[0] = this.path[matchLength];
      nindex[1] = key[forkDepth];

      const segmentCount = ((forkDepth % SEGMENT_LENGTH) === SEGMENT_LENGTH - 1)
        ? 1
        : lchild.segmentCount + rchild.segmentCount;

      const nchild = new PARTLinearNode(
        nindex,
        [lchild, rchild],
        lchild.hash ^ rchild.hash,
        segmentCount,
        owner,
      );

      if (matchLength === 0) return nchild;

      if (this.owner === owner) {
        this.child = nchild;
        this.path = this.path.subarray(0, matchLength);
        this.hash = nchild.hash;
        this.segmentCount = segmentCount;
        return this;
      }
      const npath = new Uint8Array(matchLength);
      for (let i = 0; i < matchLength; i++) {
        npath[i] = this.path[i];
      }

      return new PARTPathNode(depth, npath, nchild, owner);
    }
  };

  PARTLinearNode = class {
    constructor(index, children, hash, segmentCount, owner) {
      this.index = index;
      this.children = children;
      this.hash = hash;
      this.owner = owner;
    }
    seek(depth, v, ascending) {
      let found = false;
      let candidate;
      let candidatev;
      if (ascending) {
        candidatev = 255;
        for (let pos = 0; pos < this.children.length; pos++) {
          const ncandidatev = this.index[pos];
          if (v <= ncandidatev && ncandidatev <= candidatev) {
            candidate = pos;
            candidatev = ncandidatev;
            found = true;
          }
        }
      } else {
        candidatev = 0;
        for (let pos = this.children.length - 1; pos >= 0; pos--) {
          const ncandidatev = this.index[pos];
          if (v >= ncandidatev && ncandidatev >= candidatev) {
            candidate = pos;
            candidatev = ncandidatev;
            found = true;
          }
        }
      }
      if (found) {
        return [candidatev, this.children[candidate]];
      }
      return [v, null];
    }
    put(depth, key, value, owner) {
      let pos = 0;
      for (; pos < this.children.length; pos++) {
        if (key[depth] === this.index[pos]) break;
      }
      const child = this.children[pos];
      if (child) {
        //We need to update the child where this key would belong.
        const nchild = this.children[pos].put(depth + 1, key, value, owner);
        if (child.hash === nchild.hash) return this;
        const segmentCount = ((depth % SEGMENT_LENGTH) === SEGMENT_LENGTH - 1)
          ? this.segmentCount
          : (this.segmentCount - child.segmentCount) + nchild.segmentCount;
        if (this.owner === owner) {
          this.children[pos] = nchild;
          this.hash = (this.hash ^ child.hash) ^ nchild.hash;
          this.segmentCount = segmentCount;
          return this;
        }
        const nchildren = [...this.children];
        nchildren[pos] = nchild;
        return new PARTLinearNode(
          [...this.index],
          nchildren,
          (this.hash ^ child.hash) ^ nchild.hash,
          segmentCount,
          owner,
        );
      }
      let nchild = new PARTLeaf(PARTHash(key), value);
      if (depth + 1 < KEY_LENGTH) {
        const path = key.slice(depth + 1, KEY_LENGTH);
        nchild = new PARTPathNode(depth + 1, path, nchild, owner);
      }
      const segmentCount = ((depth % SEGMENT_LENGTH) === SEGMENT_LENGTH - 1)
        ? this.segmentCount + 1
        : this.segmentCount + nchild.segmentCount;
      if (this.children.length < linearNodeSize) {
        //We append a new child for this key.
        if (this.owner === owner) {
          this.children.push(nchild);
          this.index[this.children.length - 1] = key[depth];
          this.hash = this.hash ^ nchild.hash;
          this.segmentCount = segmentCount;
          return this;
        } else {
          const nchildren = [...this.children, nchild];
          const nindex = new Uint8Array(this.index);
          nindex[nchildren.length - 1] = key[depth];
          return new PARTLinearNode(
            nindex,
            nchildren,
            this.hash ^ nchild.hash,
            segmentCount,
            owner,
          );
        }
      }
      //We're out of space so we have to switch to an indirect node.
      const nchildren = [...this.children, nchild];
      const nindex = new Uint8Array(256);
      for (let i = 0; i < this.index.length; i++) {
        nindex[this.index[i]] = i + 1;
      }
      nindex[key[depth]] = nchildren.length;
      return new PARTIndirectNode(
        nindex,
        nchildren,
        this.hash ^ nchild.hash,
        segmentCount,
        owner,
      );
    }
  };

  PARTIndirectNode = class {
    constructor(index, children, hash, segmentCount, owner) {
      this.index = index;
      this.children = children;
      this.hash = hash;
      this.segmentCount = segmentCount;
      this.owner = owner;
    }
    seek(depth, v, ascending) {
      if (ascending) {
        for (let pos = v; pos <= 255; pos++) {
          const candidate = this.children[this.index[pos] - 1];
          if (candidate) {
            return [pos, candidate];
          }
        }
      } else {
        for (let pos = v; pos >= 0; pos--) {
          const candidate = this.children[this.index[pos] - 1];
          if (candidate) {
            return [pos, candidate];
          }
        }
      }
      return [v, null];
    }
    put(depth, key, value, owner) {
      const pos = this.index[key[depth]] - 1;
      const child = this.children[pos];
      if (child) {
        //We need to update the child where this key would belong.
        const nchild = child.put(depth + 1, key, value, owner);
        if (child.hash === nchild.hash) return this;
        const hash = (this.hash ^ child.hash) ^ nchild.hash;
        const segmentCount = ((depth % SEGMENT_LENGTH) === SEGMENT_LENGTH - 1)
          ? this.segmentCount
          : (this.segmentCount - child.segmentCount) + nchild.segmentCount;
        if (this.owner === owner) {
          this.children[pos] = nchild;
          this.hash = hash;
          this.segmentCount = segmentCount;
          return this;
        }
        const nchildren = [...this.children];
        nchildren[pos] = nchild;
        return new PARTIndirectNode(
          [...this.index],
          nchildren,
          hash,
          segmentCount,
          owner,
        );
      }
      const restLength = KEY_LENGTH - depth - 1;
      let nchild = new PARTLeaf(PARTHash(key), value);
      if (restLength !== 0) {
        const path = new Uint8Array(restLength);
        for (let i = 0; i < restLength; i++) {
          path[i] = key[KEY_LENGTH - restLength + i];
        }
        nchild = new PARTPathNode(depth + 1, path, nchild, owner);
      }
      const hash = this.hash ^ nchild.hash;
      const segmentCount = ((depth % SEGMENT_LENGTH) === SEGMENT_LENGTH - 1)
        ? this.segmentCount + 1
        : this.segmentCount + nchild.segmentCount;
      if (this.children.length < indirectNodeSize) {
        //We append a new child for this key.
        if (this.owner === owner) {
          this.children.push(nchild);
          this.index[key[depth]] = this.children.length;
          this.hash = hash;
          this.segmentCount = segmentCount;
          return this;
        }
        const nchildren = [...this.children];
        nchildren.push(nchild);
        const nindex = new Uint8Array(this.index);
        nindex[key[depth]] = nchildren.length;
        return new PARTIndirectNode(
          nindex,
          nchildren,
          hash,
          owner,
        );
      }
      //We're out of space so we have to switch to a direct node.
      const nchildren = new Array(256);
      for (let i = 0; i < 256; i++) {
        const child = this.children[this.index[i] - 1];
        if (child) nchildren[i] = child;
      }
      nchildren[key[depth]] = nchild;
      return new PARTDirectNode(nchildren, hash, segmentCount, owner);
    }
  };

  PARTDirectNode = class {
    constructor(children, hash, segmentCount, owner) {
      this.children = children;
      this.hash = hash;
      this.segmentCount = segmentCount;
      this.owner = owner;
    }
    seek(depth, v, ascending) {
      if (ascending) {
        for (let pos = v; pos <= 255; pos++) {
          const candidate = this.children[pos];
          if (candidate) {
            return [pos, candidate];
          }
        }
      } else {
        for (let pos = v; pos >= 0; pos--) {
          const candidate = this.children[pos];
          if (candidate) {
            return [pos, candidate];
          }
        }
      }
      return [v, null];
    }
    put(depth, key, value, owner) {
      const pos = key[depth];
      const child = this.children[pos];
      let nchild;
      let hash;
      let segmentCount;
      if (child) {
        //We need to update the child where this key would belong.
        nchild = child.put(depth + 1, key, value, owner);
        if (child.hash === nchild.hash) return this;
        hash = (this.hash ^ child.hash) ^ nchild.hash;
        segmentCount = ((depth % SEGMENT_LENGTH) === SEGMENT_LENGTH - 1)
          ? this.segmentCount
          : (this.segmentCount - child.segmentCount) + nchild.segmentCount;
      } else {
        nchild = new PARTLeaf(PARTHash(key), value);
        const restLength = KEY_LENGTH - depth - 1;
        if (restLength !== 0) {
          const path = new Uint8Array(restLength);
          for (let i = 0; i < restLength; i++) {
            path[i] = key[KEY_LENGTH - restLength + i];
          }
          const childDepth = depth + 1;
          nchild = new PARTPathNode(childDepth, path, nchild, owner);
        }
        hash = this.hash ^ nchild.hash;
        segmentCount = ((depth % SEGMENT_LENGTH) === SEGMENT_LENGTH - 1)
          ? this.segmentCount + 1
          : this.segmentCount + nchild.segmentCount;
      }
      if (this.owner === owner) {
        this.children[pos] = nchild;
        this.hash = hash;
        this.segmentCount = segmentCount;
        return this;
      }
      const nchildren = [...this.children];
      nchildren[pos] = nchild;
      return new PARTDirectNode(nchildren, hash, segmentCount, owner);
    }
  };

  return new PARTree();
};

const emptyTriblePART = makePART(TRIBLE_SIZE, SEGMENT_SIZE);
const emptyValuePART = makePART(VALUE_SIZE, SEGMENT_SIZE);
const emptySegmentPART = makePART(SEGMENT_SIZE, SEGMENT_SIZE);

export { emptySegmentPART, emptyTriblePART, emptyValuePART, makePART, PARTHash };
