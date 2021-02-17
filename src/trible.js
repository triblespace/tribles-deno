const TRIBLE_SIZE = 64;
const SEGMENT_SIZE = 16;

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

const v1zero = (trible) => {
  const view = new Uint32Array(trible.buffer, trible.byteOffset, 4);
  return view[0] === 0 && view[1] === 0 && view[2] === 0 && view[3] === 0;
};

const equalId = (tribleA, tribleB) => {
  const viewA = new Uint32Array(tribleA.buffer, tribleA.byteOffset, 4);
  const viewB = new Uint32Array(tribleB.buffer, tribleB.byteOffset, 4);
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
          this.t * TRIBLE_SIZE,
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

export {
  A,
  contiguousTribles,
  E,
  equal,
  equalId,
  equalValue,
  isTransactionMarker,
  isValidTransaction,
  SEGMENT_SIZE,
  TRIBLE_SIZE,
  V,
  V1,
  v1zero,
  V2,
};
