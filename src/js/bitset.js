const highBit32 = 1 << 31;

export function* bitIterator(bitset) {
  for (let wordPosition = 0; wordPosition < 8; wordPosition++) {
    for (let mask = 0xffffffff; ; ) {
      const c = Math.clz32(bitset[wordPosition] & mask);
      if (c === 32) break;
      yield (wordPosition << 5) + c;
      mask &= ~(highBit32 >>> c);
    }
  }
}

export function nextBit(bitPosition, bitset, offset = 0) {
  let wordPosition = bitPosition >>> 5;
  const mask = ~0 >>> bitPosition;
  const c = Math.clz32(bitset[offset + wordPosition] & mask);
  if (c < 32) return (wordPosition << 5) + c;
  for (wordPosition++; wordPosition < 8; wordPosition++) {
    const c = Math.clz32(bitset[offset + wordPosition]);
    if (c < 32) return (wordPosition << 5) + c;
  }
  return 256;
}

export function ctz32(n) {
  // pos trailing zeros
  n |= n << 16;
  n |= n << 8;
  n |= n << 4;
  n |= n << 2;
  n |= n << 1;
  // 2. Now, inversing the bits reveals the lowest bits
  return 32 - Math.clz32(~n);
}

export function prevBit(bitPosition, bitset, offset = 0) {
  let wordPosition = bitPosition >>> 5;
  const mask = ~(~highBit32 >>> bitPosition);
  const c = ctz32(bitset[offset + wordPosition] & mask);
  if (c < 32) return (wordPosition << 5) + (31 - c);
  for (wordPosition--; wordPosition > 0; wordPosition--) {
    const c = ctz32(bitset[offset + wordPosition]);
    if (c < 32) return (wordPosition << 5) + (31 - c);
  }
  return -1;
}

export function unsetBit(bitset, bitPosition, offset = 0) {
  bitset[offset + (bitPosition >>> 5)] &= ~(highBit32 >>> bitPosition);
}

export function setBit(bitset, bitPosition, offset = 0) {
  bitset[offset + (bitPosition >>> 5)] |= highBit32 >>> bitPosition;
}

export function intersectBitRange(
  bitset,
  fromBitPosition,
  toBitPosition,
  offset = 0
) {
  let fromWordPosition = fromBitPosition >>> 5;
  let toWordPosition = toBitPosition >>> 5;
  for (let wordPosition = 0; wordPosition < fromWordPosition; wordPosition++) {
    bitset[offset + wordPosition] = 0;
  }
  bitset[offset + fromWordPosition] &= ~0 >>> fromBitPosition;
  bitset[offset + toWordPosition] &= ~(~highBit32 >>> toBitPosition);
  for (
    let wordPosition = toWordPosition + 1;
    wordPosition < 8;
    wordPosition++
  ) {
    bitset[offset + wordPosition] = 0;
  }
}

export function hasBit(bitset, bitPosition, offset = 0) {
  return (
    (bitset[offset + (bitPosition >>> 5)] & (highBit32 >>> bitPosition)) !== 0
  );
}

export function fullSet() {
  return new Uint32Array(8).fill(~0);
}
export function emptySet() {
  return new Uint32Array(8);
}

export function noBit(bitset, offset = 0) {
  return (
    bitset[offset + 0] === 0 &&
    bitset[offset + 1] === 0 &&
    bitset[offset + 2] === 0 &&
    bitset[offset + 3] === 0 &&
    bitset[offset + 4] === 0 &&
    bitset[offset + 5] === 0 &&
    bitset[offset + 6] === 0 &&
    bitset[offset + 7] === 0
  );
}

export function isSupersetOf(left, right, offset = 0) {
  return (
    ((left[offset + 0] & right[0]) ^ right[0]) === 0 &&
    ((left[offset + 1] & right[1]) ^ right[1]) === 0 &&
    ((left[offset + 2] & right[2]) ^ right[2]) === 0 &&
    ((left[offset + 3] & right[3]) ^ right[3]) === 0 &&
    ((left[offset + 4] & right[4]) ^ right[4]) === 0 &&
    ((left[offset + 5] & right[5]) ^ right[5]) === 0 &&
    ((left[offset + 6] & right[6]) ^ right[6]) === 0 &&
    ((left[offset + 7] & right[7]) ^ right[7]) === 0
  );
}

export function isSubsetOf(left, right, offset = 0) {
  return (
    ((left[offset + 0] & right[0]) ^ left[offset + 0]) === 0 &&
    ((left[offset + 1] & right[1]) ^ left[offset + 1]) === 0 &&
    ((left[offset + 2] & right[2]) ^ left[offset + 2]) === 0 &&
    ((left[offset + 3] & right[3]) ^ left[offset + 3]) === 0 &&
    ((left[offset + 4] & right[4]) ^ left[offset + 4]) === 0 &&
    ((left[offset + 5] & right[5]) ^ left[offset + 5]) === 0 &&
    ((left[offset + 6] & right[6]) ^ left[offset + 6]) === 0 &&
    ((left[offset + 7] & right[7]) ^ left[offset + 7]) === 0
  );
}

export function setAllBit(bitset, offset = 0) {
  bitset[offset + 0] = ~0;
  bitset[offset + 1] = ~0;
  bitset[offset + 2] = ~0;
  bitset[offset + 3] = ~0;
  bitset[offset + 4] = ~0;
  bitset[offset + 5] = ~0;
  bitset[offset + 6] = ~0;
  bitset[offset + 7] = ~0;
}

export function unsetAllBit(bitset, offset = 0) {
  bitset[offset + 0] = 0;
  bitset[offset + 1] = 0;
  bitset[offset + 2] = 0;
  bitset[offset + 3] = 0;
  bitset[offset + 4] = 0;
  bitset[offset + 5] = 0;
  bitset[offset + 6] = 0;
  bitset[offset + 7] = 0;
}

export function bitIntersect(left, right, out = left, offset = 0) {
  out[offset + 0] = left[offset + 0] & right[0];
  out[offset + 1] = left[offset + 1] & right[1];
  out[offset + 2] = left[offset + 2] & right[2];
  out[offset + 3] = left[offset + 3] & right[3];
  out[offset + 4] = left[offset + 4] & right[4];
  out[offset + 5] = left[offset + 5] & right[5];
  out[offset + 6] = left[offset + 6] & right[6];
  out[offset + 7] = left[offset + 7] & right[7];
}

export function bitUnion(left, right, out = left) {
  out[0] = left[0] | right[0];
  out[1] = left[1] | right[1];
  out[2] = left[2] | right[2];
  out[3] = left[3] | right[3];
  out[4] = left[4] | right[4];
  out[5] = left[5] | right[5];
  out[6] = left[6] | right[6];
  out[7] = left[7] | right[7];
}

export function bitSubtract(left, right, out = left) {
  out[0] = left[0] & ~right[0];
  out[1] = left[1] & ~right[1];
  out[2] = left[2] & ~right[2];
  out[3] = left[3] & ~right[3];
  out[4] = left[4] & ~right[4];
  out[5] = left[5] & ~right[5];
  out[6] = left[6] & ~right[6];
  out[7] = left[7] & ~right[7];
}

export function bitDiff(left, right, out = left) {
  out[0] = left[0] ^ right[0];
  out[1] = left[1] ^ right[1];
  out[2] = left[2] ^ right[2];
  out[3] = left[3] ^ right[3];
  out[4] = left[4] ^ right[4];
  out[5] = left[5] ^ right[5];
  out[6] = left[6] ^ right[6];
  out[7] = left[7] ^ right[7];
}

export function bitComplement(bitset, out = bitset) {
  out[0] = ~bitset[0];
  out[1] = ~bitset[1];
  out[2] = ~bitset[2];
  out[3] = ~bitset[3];
  out[4] = ~bitset[4];
  out[5] = ~bitset[5];
  out[6] = ~bitset[6];
  out[7] = ~bitset[7];
}

export function singleBitIntersect(bitset, bit, offset = 0) {
  const hadBit = hasBit(bitset, bit, offset);
  unsetAllBit(bitset, offset);
  if (hadBit) setBit(bitset, bit, offset);
}
