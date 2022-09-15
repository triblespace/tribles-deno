export const bigIntToBytes = (bn, b, offset, length) => {
  let n = bn;
  for (let i = offset + length - 1; offset <= i; i--) {
    b[i] = new Number(n & 0xffn);
    n = n >> 8n;
  }
  return b;
};

export const bytesToBigInt = (b, offset, length) => {
  let n = 0n;
  const end = offset + length;
  for (let i = offset; i < end; i++) {
    n = n << 8n;
    n = n | BigInt(b[i]);
  }
  return n;
};

export const spreadBits = (x) => {
  let X = BigInt(x);
  X =
    (X | (X << 64n)) &
    0b000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111n;

  X =
    (X | (X << 32n)) &
    0b000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111n;

  X =
    (X | (X << 16n)) &
    0b000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111n;

  X =
    (X | (X << 8n)) &
    0b000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111n;

  X =
    (X | (X << 4n)) &
    0b000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011n;

  X =
    (X | (X << 2n)) &
    0b001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001n;
  return X;
};

export const unspreadBits = (x) => {
  let X = BigInt(x);
  X =
    X &
    0b001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001n;
  X =
    (X | (X >> 2n)) &
    0b000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011n;

  X =
    (X | (X >> 4n)) &
    0b000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111n;

  X =
    (X | (X >> 8n)) &
    0b000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111n;

  X =
    (X | (X >> 16n)) &
    0b000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111n;

  X =
    (X | (X >> 32n)) &
    0b000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111n;

  X =
    (X | (X >> 64n)) &
    0b1111111111111111111111111111111111111111111111111111111111111111n;

  return X;
};
