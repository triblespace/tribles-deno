const highBit32 = 1 << 31;

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

function popcnt32 (n) {
  n = n - ((n >> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
  return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24
}

export class ByteBitset {
  constructor(u32array = new Uint32Array(8)) {
    this.u32array = u32array;
  }

  copy() {
    return new ByteBitset(this.u32array.slice());
  }

  *entries() {
    for (let wordPosition = 0; wordPosition < 8; wordPosition++) {
      for (let mask = 0xffffffff; ; ) {
        const c = Math.clz32(this.u32array[wordPosition] & mask);
        if (c === 32) break;
        yield (wordPosition << 5) + c;
        mask &= ~(highBit32 >>> c);
      }
    }
  }

  count() {
    return popcnt32(this.u32array[0]) +
           popcnt32(this.u32array[1]) +
           popcnt32(this.u32array[2]) +
           popcnt32(this.u32array[3]) +
           popcnt32(this.u32array[4]) +
           popcnt32(this.u32array[5]) +
           popcnt32(this.u32array[6]) +
           popcnt32(this.u32array[7]);
  }

  has(byte) {
    return ((this.u32array[byte >>> 5] & (highBit32 >>> byte)) !== 0);
  }

  set(byte) {
    this.u32array[byte >>> 5] |= highBit32 >>> byte;
  }

  unset(byte) {
    this.u32array[byte >>> 5] &= ~(highBit32 >>> byte);
  }

  next(byte) {
    let wordPosition = byte >>> 5;
    const mask = ~0 >>> byte;
    const c = Math.clz32(this.u32array[wordPosition] & mask);
    if (c < 32) return (wordPosition << 5) + c;
    for (wordPosition++; wordPosition < 8; wordPosition++) {
      const c = Math.clz32(this.u32array[wordPosition]);
      if (c < 32) return (wordPosition << 5) + c;
    }
    return undefined;
  }

  prev(byte) {
    let wordPosition = byte >>> 5;
    const mask = ~(~highBit32 >>> byte);
    const c = ctz32(this.u32array[wordPosition] & mask);
    if (c < 32) return (wordPosition << 5) + (31 - c);
    for (wordPosition--; wordPosition > 0; wordPosition--) {
      const c = ctz32(this.u32array[wordPosition]);
      if (c < 32) return (wordPosition << 5) + (31 - c);
    }
    return undefined;
  }
 
  drainNext() {
    const byte = this.next(0);
    this.unset(byte);
    return byte;
  }

  drainPrev() {
    const byte = this.prev(255);
    this.unset(byte);
    return byte;
  }

  singleIntersect(byte) {
    if(this.has(byte)){
      this.unsetAll();
      this.set(byte);
    } else {
      this.unsetAll();
    }
    return this;
  }
  

  setAll() {
    this.u32array[0] = ~0;
    this.u32array[1] = ~0;
    this.u32array[2] = ~0;
    this.u32array[3] = ~0;
    this.u32array[4] = ~0;
    this.u32array[5] = ~0;
    this.u32array[6] = ~0;
    this.u32array[7] = ~0;
    return this;
  }

  unsetAll() {
    this.u32array[0] = 0;
    this.u32array[1] = 0;
    this.u32array[2] = 0;
    this.u32array[3] = 0;
    this.u32array[4] = 0;
    this.u32array[5] = 0;
    this.u32array[6] = 0;
    this.u32array[7] = 0;
    return this;
  }

  intersectRange(fromByte, toByte) {
    let fromWordPosition = fromByte >>> 5;
    let toWordPosition = toByte >>> 5;
    for (let wordPosition = 0; wordPosition < fromWordPosition; wordPosition++) {
      this.u32array[wordPosition] = 0;
    }
    this.u32array[fromWordPosition] &= ~0 >>> fromByte;
    this.u32array[toWordPosition] &= ~(~highBit32 >>> toByte);
    for (
      let wordPosition = toWordPosition + 1;
      wordPosition < 8;
      wordPosition++
    ) {
      this.u32array[wordPosition] = 0;
    }
    return this;
  }

  isEmpty() {
    return (
      this.u32array[0] === 0 &&
      this.u32array[1] === 0 &&
      this.u32array[2] === 0 &&
      this.u32array[3] === 0 &&
      this.u32array[4] === 0 &&
      this.u32array[5] === 0 &&
      this.u32array[6] === 0 &&
      this.u32array[7] === 0
    );
  }

  isSupersetOf(other) {
    return (
      ((this.u32array[0] & other.u32array[0]) ^ other.u32array[0]) === 0 &&
      ((this.u32array[1] & other.u32array[1]) ^ other.u32array[1]) === 0 &&
      ((this.u32array[2] & other.u32array[2]) ^ other.u32array[2]) === 0 &&
      ((this.u32array[3] & other.u32array[3]) ^ other.u32array[3]) === 0 &&
      ((this.u32array[4] & other.u32array[4]) ^ other.u32array[4]) === 0 &&
      ((this.u32array[5] & other.u32array[5]) ^ other.u32array[5]) === 0 &&
      ((this.u32array[6] & other.u32array[6]) ^ other.u32array[6]) === 0 &&
      ((this.u32array[7] & other.u32array[7]) ^ other.u32array[7]) === 0
    );
  }

  isSubsetOf(other) {
    return (
      ((this.u32array[0] & other.u32array[0]) ^ this.u32array[0]) === 0 &&
      ((this.u32array[1] & other.u32array[1]) ^ this.u32array[1]) === 0 &&
      ((this.u32array[2] & other.u32array[2]) ^ this.u32array[2]) === 0 &&
      ((this.u32array[3] & other.u32array[3]) ^ this.u32array[3]) === 0 &&
      ((this.u32array[4] & other.u32array[4]) ^ this.u32array[4]) === 0 &&
      ((this.u32array[5] & other.u32array[5]) ^ this.u32array[5]) === 0 &&
      ((this.u32array[6] & other.u32array[6]) ^ this.u32array[6]) === 0 &&
      ((this.u32array[7] & other.u32array[7]) ^ this.u32array[7]) === 0
    );
  }

  setFrom(other) {
    this.u32array[0] = other.u32array[0];
    this.u32array[1] = other.u32array[1];
    this.u32array[2] = other.u32array[2];
    this.u32array[3] = other.u32array[3];
    this.u32array[4] = other.u32array[4];
    this.u32array[5] = other.u32array[5];
    this.u32array[6] = other.u32array[6];
    this.u32array[7] = other.u32array[7];
    return this;
  }

  setIntersection(left, right) {
    this.u32array[0] = left.u32array[0] & right.u32array[0];
    this.u32array[1] = left.u32array[1] & right.u32array[1];
    this.u32array[2] = left.u32array[2] & right.u32array[2];
    this.u32array[3] = left.u32array[3] & right.u32array[3];
    this.u32array[4] = left.u32array[4] & right.u32array[4];
    this.u32array[5] = left.u32array[5] & right.u32array[5];
    this.u32array[6] = left.u32array[6] & right.u32array[6];
    this.u32array[7] = left.u32array[7] & right.u32array[7];
    return this;
  }

  setUnion(left, right) {
    this.u32array[0] = left.u32array[0] | right.u32array[0];
    this.u32array[1] = left.u32array[1] | right.u32array[1];
    this.u32array[2] = left.u32array[2] | right.u32array[2];
    this.u32array[3] = left.u32array[3] | right.u32array[3];
    this.u32array[4] = left.u32array[4] | right.u32array[4];
    this.u32array[5] = left.u32array[5] | right.u32array[5];
    this.u32array[6] = left.u32array[6] | right.u32array[6];
    this.u32array[7] = left.u32array[7] | right.u32array[7];
    return this;
  }

  setSubtraction(left, right) {
    this.u32array[0] = left.u32array[0] & ~right.u32array[0];
    this.u32array[1] = left.u32array[1] & ~right.u32array[1];
    this.u32array[2] = left.u32array[2] & ~right.u32array[2];
    this.u32array[3] = left.u32array[3] & ~right.u32array[3];
    this.u32array[4] = left.u32array[4] & ~right.u32array[4];
    this.u32array[5] = left.u32array[5] & ~right.u32array[5];
    this.u32array[6] = left.u32array[6] & ~right.u32array[6];
    this.u32array[7] = left.u32array[7] & ~right.u32array[7];
    return this;
  }

  setDifference(left, right) {
    this.u32array[0] = left.u32array[0] ^ right.u32array[0];
    this.u32array[1] = left.u32array[1] ^ right.u32array[1];
    this.u32array[2] = left.u32array[2] ^ right.u32array[2];
    this.u32array[3] = left.u32array[3] ^ right.u32array[3];
    this.u32array[4] = left.u32array[4] ^ right.u32array[4];
    this.u32array[5] = left.u32array[5] ^ right.u32array[5];
    this.u32array[6] = left.u32array[6] ^ right.u32array[6];
    this.u32array[7] = left.u32array[7] ^ right.u32array[7];
    return this;
  }

  setComplement(other) {
    this.u32array[0] = ~other.u32array[0];
    this.u32array[1] = ~other.u32array[1];
    this.u32array[2] = ~other.u32array[2];
    this.u32array[3] = ~other.u32array[3];
    this.u32array[4] = ~other.u32array[4];
    this.u32array[5] = ~other.u32array[5];
    this.u32array[6] = ~other.u32array[6];
    this.u32array[7] = ~other.u32array[7];
    return this;
  }
}


export class ByteBitsetArray {
  constructor(length) {
    this.length = length;
    this.buffer = new Uint32Array(length*8);
  }

  get(offset) {
    return new ByteBitset(this.buffer.subarray(offset*8, (offset+1)*8));
  }
}