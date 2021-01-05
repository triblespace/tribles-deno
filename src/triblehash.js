import {
  blake2s32,
  blake2sFinal,
  blake2sInit,
  blake2sUpdate,
} from "./blake2s.js";
import { TRIBLE_SIZE } from "./trible.js";

function tribleHashInit(trible) {
  const levels = [...new Array(TRIBLE_SIZE)].map((x) => blake2sInit(32, null));
  return { prev: trible, levels };
}

function tribleHashUpdate(ctx, trible) {
  if (ctx.prev) {
    let i;
    for (i = 0; i < TRIBLE_SIZE; i++) {
      if (ctx.prev[i] != trible[i]) break;
    }
    const tribleCtx = blake2sInit(32, null);
    blake2sUpdate(tribleCtx, ctx.prev);
    const hash = blake2sFinal(tribleCtx, new Uint8Array(32));
    for (let j = TRIBLE_SIZE - 1; j > i; j--) {
      if (0 < ctx.level[j].c) {
        blake2sUpdate(ctx.level[j], hash);
        blake2sFinal(ctx.level[j], hash);
        ctx.level[j] = blake2sInit(32, null);
      }
    }
    blake2sUpdate(ctx.level[i], hash);
  }
  ctx.prev = trible;
}

function tribleHashFinal(ctx, output) {
  if (ctx.prev) {
    const tribleCtx = blake2sInit(32, null);
    blake2sUpdate(tribleCtx, ctx.prev);
    const hash = blake2sFinal(tribleCtx, new Uint8Array(32));
    for (let j = TRIBLE_SIZE - 1; j > 0; j--) {
      blake2sUpdate(ctx.level[j], hash);
      blake2sFinal(ctx, hash);
    }
    blake2sUpdate(ctx.level[0], hash);
  }
  return blake2sFinal(ctx, output);
}

function partHashLeaf(key, output = new Uint8Array(32)) {
  const ctx = blake2sInit(32, null);
  blake2sUpdate(ctx, key);
  return blake2sFinal(ctx, output);
}

function partHashChildren(children, output = new Uint8Array(32)) {
  if (children.length === 1) {
    return children[0];
  }
  var outHash = new Uint8Array(32);

  for (const h of children) {
    xorHash(outHash, h)
  }
  return outHash;
}

const equalHash = (hashA, hashB) => {
  const viewA = new Uint32Array(hashA.buffer, hashA.byteOffset, 8);
  const viewB = new Uint32Array(hashB.buffer, hashB.byteOffset, 8);
  for (let i = 0; i < 8; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
};

const xorHash = (hashA, hashB) => {
  const viewA = new Uint32Array(hashA.buffer, hashA.byteOffset, 8);
  const viewB = new Uint32Array(hashB.buffer, hashB.byteOffset, 8);
  for (let i = 0; i < 8; i++) {
    viewA[i] ^= viewB[i];
  }
  return viewA;
};

export {
  equalHash,
  partHashChildren,
  partHashLeaf,
  xorHash,
  tribleHashFinal,
  tribleHashInit,
  tribleHashUpdate,
};
