import { TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";

const makePART = function (KEY_LENGTH) {
  const linearNodeSize = 16;
  const indirectNodeSize = 64;

  class PARTCursor {
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
  }

  class PARTLeaf {
    constructor(value, owner) {
      this.value = value;
      this.owner = owner;
    }
    put(depth, key, upsert, owner) {
      let value = upsert ? upsert(this.value) : null;
      if (this.owner === owner) {
        this.value = value;
        return this;
      }
      if (value === this.value) {
        return this;
      }
      return new PARTLeaf(value, owner);
    }
    seek(depth, v, ascending) {
      throw new Error("Can't seek on PARTLeaf!");
    }
  }

  class PARTBatch {
    constructor(child, owner) {
      this.owner = owner;
      this.child = child;
      this.completed = false;
    }
    complete() {
      if (this.completed) throw Error("Batch already completed.");
      this.completed = true;
      return new PARTree(this.child);
    }
    put(key, upsert = null) {
      if (this.completed) {
        throw Error("Can't put into already completed batch.");
      }
      if (this.child) {
        this.child = this.child.put(0, key, upsert, this.owner);
      } else {
        const path = new Uint8Array(KEY_LENGTH);
        for (let i = 0; i < KEY_LENGTH; i++) {
          path[i] = key[i];
        }
        this.child = new PARTPathNode(
          0,
          path,
          new PARTLeaf(upsert ? upsert(undefined) : null, this.owner),
          this.owner,
        );
      }
    }
  }

  class PARTree {
    constructor(child = null) {
      this.child = child;
    }
    batch() {
      return new PARTBatch(this.child, {});
    }

    /*
    difference(other) {
      if(this.child.owner === other.child.owner) {
        return new PARTree();
      } else {
        return 
      }
    } */

    put(key, upsert = null) {
      const owner = {};
      if (this.child) {
        const nchild = this.child.put(0, key, upsert, owner);
        if (this.child === nchild) return this;
        return new PARTree(nchild);
      }
      const path = key.slice(0, KEY_LENGTH);
      return new PARTree(
        new PARTPathNode(
          0,
          path,
          new PARTLeaf(upsert ? upsert(undefined) : null, owner),
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
  }

  class PARTPathNode {
    constructor(depth, path, child, owner) {
      this.depth = depth;
      this.path = path;
      this.child = child;
      this.owner = owner;
    }
    seek(depth, v, ascending) {
      let candidate = this.path[depth - this.depth];
      if ((ascending && v <= candidate) || (!ascending && v >= candidate)) {
        if (depth === this.depth + this.path.length - 1) {
          return [candidate, this.child];
        }
        return [candidate, this];
      }
      return [v, null];
    }
    put(depth, key, upsert, owner) {
      let matchLength = 0;
      for (; matchLength < this.path.length; matchLength++) {
        if (this.path[matchLength] !== key[depth + matchLength]) break;
      }
      if (matchLength === this.path.length) {
        const nchild = this.child.put(
          depth + this.path.length,
          key,
          upsert,
          owner,
        );
        if (this.owner === owner) {
          this.child = nchild;
          return this;
        } else if (this.child === nchild) return this;
        return new PARTPathNode(depth, this.path, nchild, owner);
      }

      const keyRestLength = KEY_LENGTH - (depth + matchLength) - 1;
      const restLength = this.path.length - matchLength - 1;

      let lchild = this.child;
      let rchild = new PARTLeaf(upsert ? upsert(undefined) : null, owner);
      if (restLength !== 0) {
        const lpath = new Uint8Array(restLength);
        for (let i = 0; i < restLength; i++) {
          lpath[i] = this.path[this.path.length - restLength + i];
        }
        lchild = new PARTPathNode(
          depth + matchLength + 1,
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
          depth + matchLength + 1,
          rpath,
          rchild,
          owner,
        );
      }
      const nindex = new Uint8Array(linearNodeSize);
      nindex[0] = this.path[matchLength];
      nindex[1] = key[depth + matchLength];
      const nchild = new PARTLinearNode(nindex, [lchild, rchild], owner);

      if (matchLength === 0) return nchild;

      if (this.owner === owner) {
        this.child = nchild;
        this.path = this.path.subarray(0, matchLength);
        return this;
      }
      const npath = new Uint8Array(matchLength);
      for (let i = 0; i < matchLength; i++) {
        npath[i] = this.path[i];
      }

      return new PARTPathNode(depth, npath, nchild, owner);
    }
  }

  class PARTLinearNode {
    constructor(index, children, owner) {
      this.index = index;
      this.children = children;
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
    put(depth, key, upsert, owner) {
      let pos = 0;
      for (; pos < this.children.length; pos++) {
        if (key[depth] === this.index[pos]) break;
      }
      const child = this.children[pos];
      if (child) {
        //We need to update the child where this key would belong.
        const nchild = this.children[pos].put(depth + 1, key, upsert, owner);
        if (this.owner === owner) {
          this.children[pos] = nchild;
          return this;
        } else if (child === nchild) return this;
        const nchildren = [...this.children];
        nchildren[pos] = nchild;
        return new PARTLinearNode([...this.index], nchildren, owner);
      }
      let nchild = new PARTLeaf(upsert ? upsert(undefined) : null, owner);
      if (depth + 1 < KEY_LENGTH) {
        const path = key.slice(depth + 1, KEY_LENGTH);
        nchild = new PARTPathNode(depth + 1, path, nchild, owner);
      }
      if (this.children.length < linearNodeSize) {
        //We append a new child for this key.
        if (this.owner === owner) {
          this.children.push(nchild);
          this.index[this.children.length - 1] = key[depth];
          return this;
        } else {
          const nchildren = [...this.children, nchild];
          const nindex = new Uint8Array(this.index);
          nindex[nchildren.length - 1] = key[depth];
          return new PARTLinearNode(nindex, nchildren, owner);
        }
      }
      //We're out of space so we have to switch to an indirect node.
      const nchildren = [...this.children, nchild];
      const nindex = new Uint8Array(256);
      for (let i = 0; i < this.index.length; i++) {
        nindex[this.index[i]] = i + 1;
      }
      nindex[key[depth]] = nchildren.length;
      return new PARTIndirectNode(nindex, nchildren, owner);
    }
  }

  class PARTIndirectNode {
    constructor(index, children, owner) {
      this.index = index;
      this.children = children;
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
    put(depth, key, upsert, owner) {
      const pos = this.index[key[depth]] - 1;
      const child = this.children[pos];
      if (child) {
        //We need to update the child where this key would belong.
        const nchild = child.put(depth + 1, key, upsert, owner);
        if (this.owner === owner) {
          this.children[pos] = nchild;
          return this;
        } else if (child === nchild) return this;
        const nchildren = [...this.children];
        nchildren[pos] = nchild;
        return new PARTIndirectNode([...this.index], nchildren, owner);
      }
      const restLength = KEY_LENGTH - depth - 1;
      let nchild = new PARTLeaf(upsert ? upsert(undefined) : null, owner);
      if (restLength !== 0) {
        const path = new Uint8Array(restLength);
        for (let i = 0; i < restLength; i++) {
          path[i] = key[KEY_LENGTH - restLength + i];
        }
        nchild = new PARTPathNode(depth + 1, path, nchild, owner);
      }
      if (this.children.length < indirectNodeSize) {
        //We append a new child for this key.
        if (this.owner === owner) {
          this.children.push(nchild);
          this.index[key[depth]] = this.children.length;
          return this;
        }
        const nchildren = [...this.children];
        nchildren.push(nchild);
        const nindex = new Uint8Array(this.index);
        nindex[key[depth]] = nchildren.length;
        return new PARTIndirectNode(nindex, nchildren, owner);
      }
      //We're out of space so we have to switch to a direct node.
      const nchildren = new Array(256);
      for (let i = 0; i < 256; i++) {
        const child = this.children[this.index[i] - 1];
        if (child) nchildren[i] = child;
      }
      nchildren[key[depth]] = nchild;
      return new PARTDirectNode(nchildren, owner);
    }
  }

  class PARTDirectNode {
    constructor(children, owner) {
      this.children = children;
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
    put(depth, key, upsert, owner) {
      const pos = key[depth];
      const child = this.children[pos];
      let nchild;
      if (child) {
        //We need to update the child where this key would belong.
        nchild = child.put(depth + 1, key, upsert, owner);
      } else {
        nchild = new PARTLeaf(upsert ? upsert(undefined) : null, owner);
        const restLength = KEY_LENGTH - depth - 1;
        if (restLength !== 0) {
          const path = new Uint8Array(restLength);
          for (let i = 0; i < restLength; i++) {
            path[i] = key[KEY_LENGTH - restLength + i];
          }
          nchild = new PARTPathNode(depth + 1, path, nchild, owner);
        }
      }
      if (this.owner === owner) {
        this.children[pos] = nchild;
        return this;
      } else if (child === nchild) return this;
      const nchildren = [...this.children];
      nchildren[pos] = nchild;
      return new PARTDirectNode(nchildren, owner);
    }
  }

  return new PARTree();
};

const TRIBLE_PART = makePART(TRIBLE_SIZE);
const VALUE_PART = makePART(VALUE_SIZE);

export { makePART, TRIBLE_PART, VALUE_PART };
