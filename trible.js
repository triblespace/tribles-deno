const TRIBLE_SIZE = 64;
const VALUE_SIZE = 32;

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

const E = (f) => f.subarray(E_START, E_END);
const A = (f) => f.subarray(A_START, A_END);
const V = (f) => f.subarray(V_START, V_END);
const V1 = (f) => f.subarray(V1_START, V1_END);
const V2 = (f) => f.subarray(V2_START, V2_END);

const v1zero = (f) => {
  const uf = new Uint32Array(f.buffer, f.byteOffset, 4);
  return uf[0] === 0 && uf[1] === 0 && uf[2] === 0 && uf[3] === 0;
};

const equal_id = (a, b) => {
  const ua = new Uint32Array(a.buffer, a.byteOffset, 4);
  const ub = new Uint32Array(b.buffer, b.byteOffset, 4);
  return (
    ua[0] === ub[0] && ua[1] === ub[1] && ua[2] === ub[2] && ua[3] === ub[3]
  );
};

export { A, E, equal_id, TRIBLE_SIZE, V, V1, v1zero, V2, VALUE_SIZE };
