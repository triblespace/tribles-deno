import { func } from "https://cdn.skypack.dev/fast-check";
import { FixedUint8Array, fixedUint8Array } from "./util.ts";

export const TRIBLE_SIZE = 64;
export const ID_SIZE = 16;
export const VALUE_SIZE = 32;

export type Trible = FixedUint8Array<typeof TRIBLE_SIZE>
export type Id = FixedUint8Array<typeof ID_SIZE>;
export type Value = FixedUint8Array<typeof VALUE_SIZE>;

export type Blob = Uint8Array;
export type LazyBlob = () => Promise<Blob>;

export const E_SIZE = ID_SIZE;
export const A_SIZE = ID_SIZE;
export const V_SIZE = VALUE_SIZE;

export const E_START = 0;
export const E_END = E_SIZE;

export const A_START = E_SIZE;
export const A_END = E_SIZE + A_SIZE;

export const V_START = E_SIZE + A_SIZE;
export const V_END = E_SIZE + A_SIZE + V_SIZE;

export const E = (trible: Trible): Id => trible.subarray(E_START, E_END) as Id;
export const A = (trible: Trible): Id => trible.subarray(A_START, A_END) as Id;
export const V = (trible: Trible): Value => trible.subarray(V_START, V_END) as Value;

export const valueAsId = (v: Value): Id | undefined => {
  const view = new Uint32Array(v.buffer, v.byteOffset + 16, 4);
  if(view[0] === 0 && view[1] === 0 && view[2] === 0 && view[3] === 0) {
    return v.subarray(16, 32) as Id;
  }
};

export function tribleFromValues(e: Value, a: Value, v: Value): Trible | undefined {
  const eId = valueAsId(e);
  if(eId === undefined) return;
  const aId = valueAsId(a);
  if(aId === undefined) return;

  const trible: Trible = fixedUint8Array(TRIBLE_SIZE);
  E(trible).set(eId);
  A(trible).set(aId);
  V(trible).set(v);

  return trible;
}

export const TribleSegmentation = (at_depth: number) => {
  if(at_depth < E_END) return 0;
  if(at_depth < A_END) return 1;
  return 2;
}

export const EAVOrder = {
  keyToTree: (at_depth: number) => at_depth,
  treeToKey: (at_depth: number) => at_depth,
};
export const EVAOrder = {
  keyToTree: (at_depth: number) => {
    if (at_depth < 16) return at_depth;
    if (at_depth < 32) return at_depth + 32;
    return at_depth - 16;
  },
  treeToKey: (at_depth: number) => {
    if (at_depth < 16) return at_depth;
    if (at_depth < 48) return at_depth + 16;
    return at_depth - 32;
  },
};
export const AEVOrder = {
  keyToTree: (at_depth: number) => {
    if (at_depth < 16) return at_depth + 16;
    if (at_depth < 32) return at_depth - 16;
    return at_depth;
  },
  treeToKey: (at_depth: number) => {
    if (at_depth < 16) return at_depth + 16;
    if (at_depth < 32) return at_depth - 16;
    return at_depth;
  },
};
export const AVEOrder = {
  keyToTree: (at_depth: number) => {
    if (at_depth < 16) return at_depth + 48;
    if (at_depth < 32) return at_depth - 16;
    return at_depth - 16;
  },
  treeToKey: (at_depth: number) => {
    if (at_depth < 16) return at_depth + 16;
    if (at_depth < 48) return at_depth + 16;
    return at_depth - 48;
  },
};
export const VEAOrder = {
  keyToTree: (at_depth: number) => {
    if (at_depth < 16) return at_depth + 32;
    if (at_depth < 32) return at_depth + 32;
    return at_depth - 32;
  },
  treeToKey: (at_depth: number) => {
    if (at_depth < 32) return at_depth + 32;
    if (at_depth < 48) return at_depth - 32;
    return at_depth - 32;
  },
};
export const VAEOrder = {
  keyToTree: (at_depth: number) => {
    if (at_depth < 16) return at_depth + 48;
    if (at_depth < 32) return at_depth + 16;
    return at_depth - 32;
  },
  treeToKey: (at_depth: number) => {
    if (at_depth < 32) return at_depth + 32;
    if (at_depth < 48) return at_depth - 16;
    return at_depth - 48;
  },
};

export const equalId = (idA: Id, idB: Id) => {
  const viewA = new Uint32Array(idA.buffer, idA.byteOffset, 4);
  const viewB = new Uint32Array(idB.buffer, idB.byteOffset, 4);
  return (
    viewA[0] === viewB[0] &&
    viewA[1] === viewB[1] &&
    viewA[2] === viewB[2] &&
    viewA[3] === viewB[3]
  );
};

export const equal = (tribleA: Trible, tribleB: Trible) => {
  const viewA = new Uint32Array(tribleA.buffer, tribleA.byteOffset, 16);
  const viewB = new Uint32Array(tribleB.buffer, tribleB.byteOffset, 16);
  for (let i = 0; i < 16; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
};

export const equalValue = (valueA: Value, valueB: Value) => {
  const viewA = new Uint32Array(valueA.buffer, valueA.byteOffset, 8);
  const viewB = new Uint32Array(valueB.buffer, valueB.byteOffset, 8);
  for (let i = 0; i < 8; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
};

export const lessValue = (valueA: Value, valueB: Value) => {
  for (let i = 0; i < 32; i++) {
    if (valueA[i] < valueB[i]) {
      return true;
    }
  }
  return false;
};
