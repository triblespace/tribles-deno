export const TRIBLE_SIZE = 64;
export const VALUE_SIZE = 32;
export const ID_SIZE = 16;

export const E_SIZE = ID_SIZE;
export const A_SIZE = ID_SIZE;
export const V_SIZE = VALUE_SIZE;

export const E_START = 0;
export const E_END = E_SIZE;

export const A_START = E_SIZE;
export const A_END = E_SIZE + A_SIZE;

export const V_START = E_SIZE + A_SIZE;
export const V_END = E_SIZE + A_SIZE + V_SIZE;

export const V_UPPER_START = 32;
export const V_UPPER_END = 48;

export const V_LOWER_START = 48;
export const V_LOWER_END = 64;

export const E = (trible) => trible.subarray(E_START, E_END);
export const A = (trible) => trible.subarray(A_START, A_END);
export const V = (trible) => trible.subarray(V_START, V_END);
export const V_UPPER = (trible) => trible.subarray(V_UPPER_START, V_UPPER_END);
export const V_LOWER = (trible) => trible.subarray(V_LOWER_START, V_LOWER_END);

export function scrambleEAV(trible) {
  return trible;
}

export function scrambleEVA(trible) {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(E(trible), 0);
  indexOrderedKey.set(V(trible), 16);
  indexOrderedKey.set(A(trible), 48);
  indexOrderedKey.__cached_hash = trible.__cached_hash;
  return indexOrderedKey;
}

export function scrambleAEV(trible) {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(A(trible), 0);
  indexOrderedKey.set(E(trible), 16);
  indexOrderedKey.set(V(trible), 32);
  indexOrderedKey.__cached_hash = trible.__cached_hash;
  return indexOrderedKey;
}

export function scrambleAVE(trible) {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(A(trible), 0);
  indexOrderedKey.set(V(trible), 16);
  indexOrderedKey.set(E(trible), 48);
  indexOrderedKey.__cached_hash = trible.__cached_hash;
  return indexOrderedKey;
}

export function scrambleVEA(trible) {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(V(trible), 0);
  indexOrderedKey.set(E(trible), 32);
  indexOrderedKey.set(A(trible), 48);
  indexOrderedKey.__cached_hash = trible.__cached_hash;
  return indexOrderedKey;
}

export function scrambleVAE(trible) {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(V(trible), 0);
  indexOrderedKey.set(A(trible), 32);
  indexOrderedKey.set(E(trible), 48);
  indexOrderedKey.__cached_hash = trible.__cached_hash;
  return indexOrderedKey;
}

export const zero = (v) => {
  const view = new Uint32Array(v.buffer, v.byteOffset, 4);
  return view[0] === 0 && view[1] === 0 && view[2] === 0 && view[3] === 0;
};

export const equalId = (idA, idB) => {
  const viewA = new Uint32Array(idA.buffer, idA.byteOffset, 4);
  const viewB = new Uint32Array(idB.buffer, idB.byteOffset, 4);
  return (
    viewA[0] === viewB[0] &&
    viewA[1] === viewB[1] &&
    viewA[2] === viewB[2] &&
    viewA[3] === viewB[3]
  );
};

export const equal = (tribleA, tribleB) => {
  const viewA = new Uint32Array(tribleA.buffer, tribleA.byteOffset, 16);
  const viewB = new Uint32Array(tribleB.buffer, tribleB.byteOffset, 16);
  for (let i = 0; i < 16; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
};

export const equalValue = (valueA, valueB) => {
  const viewA = new Uint32Array(valueA.buffer, valueA.byteOffset, 8);
  const viewB = new Uint32Array(valueB.buffer, valueB.byteOffset, 8);
  for (let i = 0; i < 8; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
};

export const lessValue = (valueA, valueB) => {
  for (let i = 0; i < 32; i++) {
    if (valueA[i] < valueB[i]) {
      return true;
    }
  }
  return false;
};
