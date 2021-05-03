/*
BSD 2-Clause License

Copyright (c) 2019, i404788
Copyright (c) 2021, somethingelseentirely
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

const PRIME64_1 = 0x9e3779b185ebca87n; /* 0b1001111000110111011110011011000110000101111010111100101010000111 */
const PRIME64_2 = 0xc2b2ae3d27d4eb4fn; /* 0b1100001010110010101011100011110100100111110101001110101101001111 */
const PRIME64_3 = 0x165667b19e3779f9n; /* 0b0001011001010110011001111011000110011110001101110111100111111001 */
const PRIME64_4 = 0x85ebca77c2b2ae63n; /* 0b1000010111101011110010100111011111000010101100101010111001100011 */
const PRIME64_5 = 0x27d4eb2f165667c5n;
const kkeyData =
  "b8fe6c3923a44bbe7c01812cf721ad1cded46de9839097db7240a4a4b7b3671fcb79e64eccc0e578825ad07dccff7221b8084674f743248ee03590e6813a264c3c2852bb91c300cb88d0658b1b532ea371644897a20df94e3819ef46a9deacd8a8fa763fe39c343ff9dcbbc7c70b4f1d8a51e04bcdb45931c89f7ec9d9787364eac5ac8334d3ebc3c581a0fffa1363eb170ddd51b7f0da49d316552629d4689e2b16be587d47a1fc8ff8b8d17ad031ce45cb3a8f95160428afd7fbcabb4b407e";
const kkey = new DataView(
  new Uint8Array(kkeyData.match(/.{2}/g).map((hex) => parseInt(hex, 16))).buffer
);
const mask64 = (1n << 64n) - 1n;
const mask32 = (1n << 32n) - 1n;
const STRIPE_LEN = 64;
const KEYSET_DEFAULT_SIZE = 48; /* minimum 32 */
const STRIPE_ELTS = STRIPE_LEN / 4;
const ACC_NB = STRIPE_LEN / 8;
const _U64 = 8;
const _U32 = 4;
const n = (n) => BigInt(n);

// Basically (byte*)buf + offset
function getView(buf, offset = 0) {
  return new DataView(buf.buffer, buf.byteOffset + offset);
}

const XXH_mult32to64 = (a, b) => ((a & mask32) * (b & mask32)) & mask64;
const assert = (a) => {
  if (!a) throw new Error("Assert failed");
};

//TODO make data and key DataViews
function XXH3_accumulate_512(acc, data, key) {
  for (let i = 0; i < ACC_NB; i++) {
    const left = 2 * i;
    const right = 2 * i + 1;
    const dataLeft = n(data.getUint32(left * 4), true);
    const dataRight = n(data.getUint32(right * 4), true); //XXH_readLE32(xdata + right);
    acc[i] += XXH_mult32to64(
      dataLeft + n(key.getUint32(left * 4), true),
      dataRight + n(key.getUint32(right * 4), true)
    );
    acc[i] += dataLeft + (dataRight << 32n);
  }
}

function XXH3_accumulate(acc, data, key, nbStripes) {
  for (let n = 0, k = 0; n < nbStripes; n++) {
    XXH3_accumulate_512(acc, getView(data, n * STRIPE_LEN), getView(key, k));
    k += 2;
  }
}

function XXH3_scrambleAcc(acc, key) {
  for (let i = 0; i < ACC_NB; i++) {
    const left = 2 * i;
    const right = 2 * i + 1;
    acc[i] ^= acc[i] >> 47n;
    const p1 = XXH_mult32to64(
      acc[i] & 0xffffffffn,
      n(key.getUint32(left, true))
    );
    const p2 = XXH_mult32to64(acc[i] >> 32n, n(key.getUint32(right, true)));
    acc[i] = p1 ^ p2;
  }
}

function XXH3_mix2Accs(acc, key) {
  return XXH3_mul128(
    acc.getBigUint64(0, true) ^ key.getBigUint64(0, true),
    acc.getBigUint64(_U64, true) ^ key.getBigUint64(_U64, true)
  );
}

function XXH3_mergeAccs(acc, key, start) {
  let result64 = start;

  result64 += XXH3_mix2Accs(getView(acc, 0 * _U64), getView(key, 0 * _U32));
  result64 += XXH3_mix2Accs(getView(acc, 2 * _U64), getView(key, 4 * _U32));
  result64 += XXH3_mix2Accs(getView(acc, 4 * _U64), getView(key, 8 * _U32));
  result64 += XXH3_mix2Accs(getView(acc, 6 * _U64), getView(key, 16 * _U32));

  return XXH3_avalanche(result64);
}

const NB_KEYS = ((KEYSET_DEFAULT_SIZE - STRIPE_ELTS) / 2) | 0;
function XXH3_hashLong(acc, data) {
  const block_len = STRIPE_LEN * NB_KEYS;
  const nb_blocks = (data.length / block_len) | 0;

  // console.log( nb_blocks, block_len)
  for (let n = 0; n < nb_blocks; n++) {
    XXH3_accumulate(acc, getView(data, n * block_len), kkey, NB_KEYS);
    XXH3_scrambleAcc(
      acc,
      getView(kkey, 4 * (KEYSET_DEFAULT_SIZE - STRIPE_ELTS))
    );
  }

  assert(data.length > STRIPE_LEN);
  {
    const nbStripes = ((data.length % block_len) / STRIPE_LEN) | 0;
    assert(nbStripes < NB_KEYS);
    XXH3_accumulate(acc, getView(data, nb_blocks * block_len), kkey, nbStripes);

    /* last stripe */
    if (data.length & (STRIPE_LEN - 1)) {
      const p = getView(data, data.length - STRIPE_LEN);
      XXH3_accumulate_512(acc, p, getView(kkey, nbStripes * 2));
    }
  }
}

function XXH3_mul128(a, b) {
  const lll = a * b;
  return (lll + (lll >> 64n)) & mask64;
}

function XXH3_mix16B(data, key) {
  return XXH3_mix2Accs(data, key);
  // return XXH3_mul128(data.readBigUInt64LE(data_offset) ^ key.readBigUInt64LE(key_offset),
  // data.readBigUInt64LE(data_offset + 8) ^ key.readBigUInt64LE(key_offset + 8));
}

function XXH3_avalanche(h64) {
  h64 ^= h64 >> 29n;
  h64 *= PRIME64_3;
  h64 &= mask64;
  h64 ^= h64 >> 32n;
  return h64;
}

// 16 byte min input 64 byte max input
export function XXH3_128(data, seed = 0n) {
  const len = data.length;
  let acc1 = PRIME64_1 * (n(len) + seed);
  let acc2 = 0n;
  if (len > 32) {
    acc1 += XXH3_mix16B(getView(data, 16), getView(kkey, 32));
    acc2 += XXH3_mix16B(getView(data, len - 32), getView(kkey, 48));
  }
  acc1 += XXH3_mix16B(getView(data, 0), getView(kkey, 0));
  acc2 += XXH3_mix16B(getView(data, len - 16), getView(kkey, 16));

  const part1 = (acc1 + acc2) & mask64;
  const part2 =
    (acc1 * PRIME64_3 + acc2 * PRIME64_4 + (n(len) - seed) * PRIME64_2) &
    mask64;

  return (XXH3_avalanche(part1) << 64n) | XXH3_avalanche(part2);
}
