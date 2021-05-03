const TRIBLE_SIZE = 64;
const VALUE_SIZE = 32;
const ID_SIZE = 16;

const E_SIZE = ID_SIZE;
const A_SIZE = ID_SIZE;
const V_SIZE = VALUE_SIZE;

const E_START = 0;
const E_END = 16;

const A_START = 16;
const A_END = 32;

const V_START = 32;
const V_END = 64;

const V1_START = 32;
const V1_END = 48;

const V2_START = 48;
const V2_END = 64;

const E = (trible) => trible.subarray(E_START, E_END);
const A = (trible) => trible.subarray(A_START, A_END);
const V = (trible) => trible.subarray(V_START, V_END);
const V1 = (trible) => trible.subarray(V1_START, V1_END);
const V2 = (trible) => trible.subarray(V2_START, V2_END);

function scrambleEAV(trible) {
  return trible;
}
function scrambleEVA(trible) {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(E(trible), 0);
  indexOrderedKey.set(V(trible), 16);
  indexOrderedKey.set(A(trible), 48);
  indexOrderedKey.__cached_XXH3_128 = trible.__cached_XXH3_128;
  return indexOrderedKey;
}
function scrambleAEV(trible) {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(A(trible), 0);
  indexOrderedKey.set(E(trible), 16);
  indexOrderedKey.set(V(trible), 32);
  indexOrderedKey.__cached_XXH3_128 = trible.__cached_XXH3_128;
  return indexOrderedKey;
}
function scrambleAVE(trible) {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(A(trible), 0);
  indexOrderedKey.set(V(trible), 16);
  indexOrderedKey.set(E(trible), 48);
  indexOrderedKey.__cached_XXH3_128 = trible.__cached_XXH3_128;
  return indexOrderedKey;
}
function scrambleVEA(trible) {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(V(trible), 0);
  indexOrderedKey.set(E(trible), 32);
  indexOrderedKey.set(A(trible), 48);
  indexOrderedKey.__cached_XXH3_128 = trible.__cached_XXH3_128;
  return indexOrderedKey;
}
function scrambleVAE(trible) {
  const indexOrderedKey = new Uint8Array(64);
  indexOrderedKey.set(V(trible), 0);
  indexOrderedKey.set(A(trible), 32);
  indexOrderedKey.set(E(trible), 48);
  indexOrderedKey.__cached_XXH3_128 = trible.__cached_XXH3_128;
  return indexOrderedKey;
}

const zero = (v) => {
  const view = new Uint32Array(v.buffer, v.byteOffset, 4);
  return view[0] === 0 && view[1] === 0 && view[2] === 0 && view[3] === 0;
};

const equalId = (idA, idB) => {
  const viewA = new Uint32Array(idA.buffer, idA.byteOffset, 4);
  const viewB = new Uint32Array(idB.buffer, idB.byteOffset, 4);
  return (
    viewA[0] === viewB[0] &&
    viewA[1] === viewB[1] &&
    viewA[2] === viewB[2] &&
    viewA[3] === viewB[3]
  );
};

const equal = (tribleA, tribleB) => {
  const viewA = new Uint32Array(tribleA.buffer, tribleA.byteOffset, 16);
  const viewB = new Uint32Array(tribleB.buffer, tribleB.byteOffset, 16);
  for (let i = 0; i < 16; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
};

const equalValue = (valueA, valueB) => {
  const viewA = new Uint32Array(valueA.buffer, valueA.byteOffset, 8);
  const viewB = new Uint32Array(valueB.buffer, valueB.byteOffset, 8);
  for (let i = 0; i < 8; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
};

const contiguousTribles = (tribles) => ({
  tribles,
  tribleCount: tribles.length / TRIBLE_SIZE,
  t: 0,
  next() {
    if (this.t < this.tribleCount) {
      return {
        value: this.tribles.subarray(
          this.t++ * TRIBLE_SIZE,
          this.t * TRIBLE_SIZE
        ),
      };
    }
    return { done: true };
  },
  [Symbol.iterator]() {
    return this;
  },
});

const isTransactionMarker = (trible) => {
  const view = new Uint32Array(trible.buffer, trible.byteOffset, 4);
  for (let i = 0; i < 4; i++) {
    if (view[i] !== 0) return false;
  }
  return true;
};

const isValidTransaction = (trible, hash) => {
  const viewT = new Uint32Array(trible.buffer, trible.byteOffset + 32, 8);
  const viewH = new Uint32Array(hash.buffer, hash.byteOffset, 8);
  for (let i = 0; i < 8; i++) {
    if (viewT[i] !== viewH[i]) return false;
  }
  return true;
};

module.exports = {
  A,
  A_SIZE,
  contiguousTribles,
  E,
  E_SIZE,
  equal,
  equalId,
  equalValue,
  ID_SIZE,
  isTransactionMarker,
  isValidTransaction,
  scrambleAEV,
  scrambleAVE,
  scrambleEAV,
  scrambleEVA,
  scrambleVAE,
  scrambleVEA,
  TRIBLE_SIZE,
  V,
  V1,
  V2,
  V_SIZE,
  VALUE_SIZE,
  zero,
};
