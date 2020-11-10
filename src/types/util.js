const bigIntToBytes = (bn, b, offset, length) => {
  let n = bn;
  for (let i = offset + length - 1; offset <= i; i--) {
    b[i] = new Number(n & 0xffn);
    n = n >> 8n;
  }
  return b;
};

const bytesToBigInt = (b, offset, length) => {
  let n = 0n;
  const end = offset + length;
  for (let i = offset; i < end; i++) {
    n = n << 8n;
    n = n | BigInt(b[i]);
  }
  return n;
};

export { bigIntToBytes, bytesToBigInt };
