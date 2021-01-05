const { TRIBLE_SIZE, VALUE_SIZE } = require("./trible.js");
const { equalHash, partHashChildren, partHashLeaf, xorHash } = require(
  "./triblehash.js",
);

const makePART = function (KEY_LENGTH) {
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

  PARTBatch = class {
    constructor(child) {
      this.child = child;
      this.completed = false;
      this.newNodesByLevel = [...new Array(KEY_LENGTH)].map((_) => []);
    }
    complete() {
      if (this.completed) throw Error("Batch already completed.");
      this.completed = true;
      for (let i = KEY_LENGTH - 1; i >= 0; i--) {
        for (const node of this.newNodesByLevel[i]) {
          node.rehash();
        }
      }
      return new PARTree(this.child);
    }
    put(key, upsert = null) {
      if (this.completed) {
        throw Error("Can't put into already completed batch.");
      }
      if (this.child) {
        this.child = this.child.put(0, key, upsert, this);
      } else {
        const path = new Uint8Array(KEY_LENGTH);
        for (let i = 0; i < KEY_LENGTH; i++) {
          path[i] = key[i];
        }
        const leaf = new PARTLeaf(
          partHashLeaf(key),
          upsert ? upsert(undefined) : null,
        );
        const nnode = new PARTPathNode(0, path, leaf);
        this.newNodesByLevel[0].push(nnode);

        this.child = nnode;
      }
      return this;
    }
  };

  function _makeNode(children, depth) {
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
        return new PARTPathNode(depth, path, child.child).rehash();
      }
      const path = new Uint8Array(1);
      path[0] = index;
      return new PARTPathNode(depth, path, child).rehash();
    }
    if (len < linearNodeSize) {
      const nindex = new Uint8Array(children.length);
      const nchildren = children.map(([index, child], i) => {
        nindex[i] = index;
        return child;
      });
      return new PARTLinearNode(nindex, nchildren).rehash();
    }
    if (len < indirectNodeSize) {
      const nindex = new Uint8Array(256);
      const nchildren = children.map(([index, child], i) => {
        nindex[index] = i + 1;
        return child;
      });
      return new PARTIndirectNode(nindex, nchildren).rehash();
    }
    const nchildren = new Array(256);
    for (let i = 0; i < children.length; i++) {
      const [index, child] = children[i];
      nchildren[index] = child;
    }
    return new PARTDirectNode(nchildren).rehash();
  }

  function _union(
    leftNode,
    rightNode,
    depth = 0,
  ) {
    const children = [];

    let [leftIndex, leftChild] = leftNode.seek(depth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(depth, 0, true);
    search:
    while (true) {
      if (!leftChild && !rightChild) break search;

      if (leftChild && (!rightChild || leftIndex < rightIndex)) {
        children.push([leftIndex, leftChild]);
        [leftIndex, leftChild] = leftNode.seek(
          depth,
          leftIndex + 1,
          true,
        );
        continue search;
      }

      if (rightChild && (!leftChild || rightIndex < leftIndex)) {
        children.push([rightIndex, rightChild]);
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
        equalHash(leftChild.hash, rightChild.hash)
      ) {
        children.push([leftIndex, rightChild]);
      } else {
        const union = _union(leftChild, rightChild, depth + 1);
        children.push([leftIndex, union]);
      }
      const nextIndex = leftIndex + 1;
      [leftIndex, leftChild] = leftNode.seek(depth, nextIndex, true);
      [rightIndex, rightChild] = rightNode.seek(depth, nextIndex, true);
    }
    return _makeNode(children, depth);
  }

  function _subtract(
    leftNode,
    rightNode,
    depth = 0,
  ) {
    const children = [];

    let [leftIndex, leftChild] = leftNode.seek(depth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(depth, leftIndex, true);
    search:
    while (true) {
      if (!leftChild) break search;

      if (!rightChild || (leftIndex < rightIndex)) {
        children.push([leftIndex, leftChild]);
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
        !equalHash(leftChild.hash, rightChild.hash)
      ) {
        const diff = _subtract(leftChild, rightChild, depth + 1);
        if (diff) {
          children.push([leftIndex, diff]);
        }
      }
      [leftIndex, leftChild] = leftNode.seek(depth, leftIndex + 1, true);
      [rightIndex, rightChild] = rightNode.seek(depth, leftIndex, true);
    }
    return _makeNode(children, depth);
  }

  function _intersect(
    leftNode,
    rightNode,
    depth = 0,
  ) {
    const children = [];

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
        equalHash(leftChild.hash, rightChild.hash)
      ) {
        children.push([leftIndex, rightChild]);
      } else {
        const intersection = _intersect(leftChild, rightChild, depth + 1);
        if (intersection) {
          children.push([leftIndex, intersection]);
        }
      }
      [leftIndex, leftChild] = leftNode.seek(depth, leftIndex + 1, true);
      [rightIndex, rightChild] = rightNode.seek(depth, leftIndex, true);
    }
    return _makeNode(children, depth);
  }

  function _difference(
    leftNode,
    rightNode,
    depth = 0,
  ) {
    const children = [];

    let [leftIndex, leftChild] = leftNode.seek(depth, 0, true);
    let [rightIndex, rightChild] = rightNode.seek(depth, 0, true);
    search:
    while (true) {
      if (!leftChild && !rightChild) break search;

      if (leftChild && (!rightChild || leftIndex < rightIndex)) {
        children.push([leftIndex, leftChild]);
        [leftIndex, leftChild] = leftNode.seek(
          depth,
          leftIndex + 1,
          true,
        );
        continue search;
      }

      if (rightChild && (!leftChild || rightIndex < leftIndex)) {
        children.push([rightIndex, rightChild]);
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
        !equalHash(leftChild.hash, rightChild.hash)
      ) {
        const difference = _difference(leftChild, rightChild, depth + 1);
        if (difference) {
          children.push([leftIndex, difference]);
        }
      }
      const nextIndex = leftIndex + 1;
      [leftIndex, leftChild] = leftNode.seek(depth, nextIndex, true);
      [rightIndex, rightChild] = rightNode.seek(depth, nextIndex, true);
    }
    return _makeNode(children, depth);
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
        !equalHash(leftChild.hash, rightChild.hash) &&
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
        equalHash(leftChild.hash, rightChild.hash)
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

  PARTree = class {
    constructor(child = null) {
      this.keyLength = KEY_LENGTH;
      this.child = child;
    }
    batch() {
      return new PARTBatch(this.child);
    }

    put(key, upsert = null) {
      if (this.child) {
        const nchild = this.child.put(0, key, upsert, null);
        if (this.child === nchild) return this;
        return new PARTree(nchild);
      }
      const path = key.slice(0, KEY_LENGTH);
      return new PARTree(
        new PARTPathNode(
          0,
          path,
          new PARTLeaf(partHashLeaf(key), upsert ? upsert(undefined) : null),
        ).rehash(),
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
          equalHash(this.child.hash, other.child.hash));
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
          equalHash(this.child.hash, other.child.hash) ||
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
      if (thisNode === otherNode || equalHash(thisNode.hash, otherNode.hash)) {
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
      if (this.child === null || equalHash(this.child.hash, other.child.hash)) {
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
      if (thisNode === otherNode || equalHash(thisNode.hash, otherNode.hash)) {
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
      if (thisNode === otherNode || equalHash(thisNode.hash, otherNode.hash)) {
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
      this.value = value;
      this.hash = hash;
    }

    put(depth, key, upsert, batch) {
      const value = upsert ? upsert(this.value) : null;
      if (value === this.value) {
        return this;
      }
      return new PARTLeaf(this.hash, value);
    }

    seek(depth, v, ascending) {
      throw new Error("Can't seek on PARTLeaf!");
    }
  };

  PARTPathNode = class {
    constructor(depth, path, child) {
      this.depth = depth;
      this.path = path;
      this.child = child;
      this.hash = null;
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
    put(depth, key, upsert, batch) {
      let matchLength = 0;
      for (; matchLength < this.path.length; matchLength++) {
        if (this.path[matchLength] !== key[depth + matchLength]) break;
      }
      if (matchLength === this.path.length) {
        const nchild = this.child.put(
          depth + this.path.length,
          key,
          upsert,
          batch,
        );
        if (!this.hash) {
          this.child = nchild;
          return this;
        } else {
          if (this.child === nchild) {
            return this;
          }
        }
        const nnode = new PARTPathNode(depth, this.path, nchild);
        if (batch) {
          batch.newNodesByLevel[depth].push(nnode);
        } else {
          nnode.rehash();
        }
        return nnode;
      }

      const keyRestLength = KEY_LENGTH - (depth + matchLength) - 1;
      const restLength = this.path.length - matchLength - 1;

      let lchild = this.child;
      let rchild = new PARTLeaf(
        partHashLeaf(key),
        upsert ? upsert(undefined) : null,
      );

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
        );
        if (batch) {
          batch.newNodesByLevel[childDepth].push(lchild);
        } else {
          lchild.rehash();
        }
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
        );
        if (batch) {
          batch.newNodesByLevel[childDepth].push(rchild);
        } else {
          rchild.rehash();
        }
      }
      const forkDepth = depth + matchLength;
      const nindex = new Uint8Array(linearNodeSize);
      nindex[0] = this.path[matchLength];
      nindex[1] = key[forkDepth];
      const nchild = new PARTLinearNode(nindex, [lchild, rchild]);
      if (batch) {
        batch.newNodesByLevel[forkDepth].push(nchild);
      } else {
        nchild.rehash();
      }

      if (matchLength === 0) return nchild;

      if (!this.hash) {
        this.child = nchild;
        this.path = this.path.subarray(0, matchLength);
        return this;
      }
      const npath = new Uint8Array(matchLength);
      for (let i = 0; i < matchLength; i++) {
        npath[i] = this.path[i];
      }

      const nnode = new PARTPathNode(depth, npath, nchild);
      if (batch) {
        batch.newNodesByLevel[depth].push(nnode);
      } else {
        nnode.rehash();
      }
      return nnode;
    }

    rehash() {
      this.hash = this.child.hash;
      return this;
    }
  };

  PARTLinearNode = class {
    constructor(index, children) {
      this.index = index;
      this.children = children;
      this.hash = null;
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
    put(depth, key, upsert, batch) {
      let pos = 0;
      for (; pos < this.children.length; pos++) {
        if (key[depth] === this.index[pos]) break;
      }
      const child = this.children[pos];
      if (child) {
        //We need to update the child where this key would belong.
        const nchild = this.children[pos].put(depth + 1, key, upsert, batch);
        if (!this.hash) {
          this.children[pos] = nchild;
          return this;
        } else if (child === nchild) return this;
        const nchildren = [...this.children];
        nchildren[pos] = nchild;
        const nnode = new PARTLinearNode([...this.index], nchildren);
        if (batch) {
          batch.newNodesByLevel[depth].push(nnode);
        } else {
          nnode.hash = xorHash(xorHash(this.hash.slice(), child.hash), nchild.hash)
        }
        return nnode;
      }
      let nchild = new PARTLeaf(
        partHashLeaf(key),
        upsert ? upsert(undefined) : null,
      );
      if (depth + 1 < KEY_LENGTH) {
        const path = key.slice(depth + 1, KEY_LENGTH);
        nchild = new PARTPathNode(depth + 1, path, nchild);
        if (batch) {
          batch.newNodesByLevel[depth + 1].push(nchild);
        } else {
          nchild.rehash();
        }
      }
      if (this.children.length < linearNodeSize) {
        //We append a new child for this key.
        if (!this.hash) {
          this.children.push(nchild);
          this.index[this.children.length - 1] = key[depth];
          return this;
        } else {
          const nchildren = [...this.children, nchild];
          const nindex = new Uint8Array(this.index);
          nindex[nchildren.length - 1] = key[depth];
          const nnode = new PARTLinearNode(nindex, nchildren);
          if (batch) {
            batch.newNodesByLevel[depth].push(nnode);
          } else {
            nnode.hash = xorHash(this.hash.slice(), nchild.hash);
          }
          return nnode;
        }
      }
      //We're out of space so we have to switch to an indirect node.
      const nchildren = [...this.children, nchild];
      const nindex = new Uint8Array(256);
      for (let i = 0; i < this.index.length; i++) {
        nindex[this.index[i]] = i + 1;
      }
      nindex[key[depth]] = nchildren.length;
      const nnode = new PARTIndirectNode(nindex, nchildren);
      if (batch) {
        batch.newNodesByLevel[depth].push(nnode);
      } else {
        nnode.hash = xorHash(this.hash.slice(), nchild.hash);
      }
      return nnode;
    }

    rehash() {
      this.hash = partHashChildren(this.children.map((c) => c.hash));
      return this;
    }
  };

  PARTIndirectNode = class {
    constructor(index, children) {
      this.index = index;
      this.children = children;
      this.hash = null;
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
    put(depth, key, upsert, batch) {
      const pos = this.index[key[depth]] - 1;
      const child = this.children[pos];
      if (child) {
        //We need to update the child where this key would belong.
        const nchild = child.put(depth + 1, key, upsert, batch);
        if (!this.hash) {
          this.children[pos] = nchild;
          return this;
        } else if (child === nchild) return this;
        const nchildren = [...this.children];
        nchildren[pos] = nchild;
        const nnode = new PARTIndirectNode([...this.index], nchildren);
        if (batch) {
          batch.newNodesByLevel[depth].push(nnode);
        } else {
          nnode.hash = xorHash(xorHash(this.hash.slice(), child.hash), nchild.hash)
        }
        return nnode;
      }
      const restLength = KEY_LENGTH - depth - 1;
      let nchild = new PARTLeaf(
        partHashLeaf(key),
        upsert ? upsert(undefined) : null,
      );
      if (restLength !== 0) {
        const path = new Uint8Array(restLength);
        for (let i = 0; i < restLength; i++) {
          path[i] = key[KEY_LENGTH - restLength + i];
        }
        nchild = new PARTPathNode(depth + 1, path, nchild);
        if (batch) {
          batch.newNodesByLevel[depth + 1].push(nchild);
        } else {
          nchild.rehash();
        }
      }
      if (this.children.length < indirectNodeSize) {
        //We append a new child for this key.
        if (!this.hash) {
          this.children.push(nchild);
          this.index[key[depth]] = this.children.length;
          return this;
        }
        const nchildren = [...this.children];
        nchildren.push(nchild);
        const nindex = new Uint8Array(this.index);
        nindex[key[depth]] = nchildren.length;
        const nnode = new PARTIndirectNode(nindex, nchildren);
        if (batch) {
          batch.newNodesByLevel[depth].push(nnode);
        } else {
          nnode.hash = xorHash(this.hash.slice(), nchild.hash);
        }
        return nnode;
      }
      //We're out of space so we have to switch to a direct node.
      const nchildren = new Array(256);
      for (let i = 0; i < 256; i++) {
        const child = this.children[this.index[i] - 1];
        if (child) nchildren[i] = child;
      }
      nchildren[key[depth]] = nchild;
      const nnode = new PARTDirectNode(nchildren);
      if (batch) {
        batch.newNodesByLevel[depth].push(nnode);
      } else {
        nnode.hash = xorHash(this.hash.slice(), nchild.hash);
      }
      return nnode;
    }

    rehash() {
      this.hash = partHashChildren(
        [...this.index.filter((v) => v !== 0)]
          .map((v) => this.children[v - 1].hash),
      );
      return this;
    }
  };

  PARTDirectNode = class {
    constructor(children) {
      this.children = children;
      this.hash = null;
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
    put(depth, key, upsert, batch) {
      const pos = key[depth];
      const child = this.children[pos];
      let nchild;
      if (child) {
        //We need to update the child where this key would belong.
        nchild = child.put(depth + 1, key, upsert, batch);
      } else {
        nchild = new PARTLeaf(
          partHashLeaf(key),
          upsert ? upsert(undefined) : null,
        );
        const restLength = KEY_LENGTH - depth - 1;
        if (restLength !== 0) {
          const path = new Uint8Array(restLength);
          for (let i = 0; i < restLength; i++) {
            path[i] = key[KEY_LENGTH - restLength + i];
          }
          const childDepth = depth + 1;
          nchild = new PARTPathNode(childDepth, path, nchild);
          if (batch) {
            batch.newNodesByLevel[childDepth].push(nchild);
          } else {
            nchild.rehash();
          }
        }
      }
      if (!this.hash) {
        this.children[pos] = nchild;
        return this;
      } else if (child === nchild) return this;
      const nchildren = [...this.children];
      nchildren[pos] = nchild;
      const nnode = new PARTDirectNode(nchildren);
      if (batch) {
        batch.newNodesByLevel[depth].push(nnode);
      } else {
        if(child){
          nnode.hash = xorHash(xorHash(this.hash.slice(), child.hash), nchild.hash);
        } else {
          nnode.hash = xorHash(this.hash.slice(), nchild.hash)
        }
      }
      return nnode;
    }

    rehash() {
      this.hash = partHashChildren(
        this.children.filter((v) => v).map((v) => v.hash),
      );
      return this;
    }
  };

  return new PARTree();
};

const emptyTriblePART = makePART(TRIBLE_SIZE);
const emptyValuePART = makePART(VALUE_SIZE);

module.exports = { emptyTriblePART, emptyValuePART, makePART };
