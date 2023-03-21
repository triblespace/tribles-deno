// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

class UFOID {
    constructor(data){
        this.data = data;
    }
    static now() {
        return UFOID.withTime(Date.now());
    }
    static withTime(time) {
        const data = new Uint8Array(16);
        const view = new DataView(data.buffer);
        view.setUint32(0, time & 0xffffffff, false);
        crypto.getRandomValues(data.subarray(4, 16));
        return new UFOID(data);
    }
    static fromValue(b) {
        const a = new Uint32Array(b.buffer, b.byteOffset, 8);
        if (a[0] !== 0 || a[1] !== 0 || a[2] !== 0 || a[3] !== 0) {
            throw Error("invalid ufoid: value must be zero padded");
        }
        if (a[4] === 0 && a[5] === 0 && a[6] === 0 && a[7] !== 0) {
            throw Error("invalid ufoid: all zero (NIL) ufoid is not a valid value");
        }
        return new UFOID(b.slice(16, 32));
    }
    static fromHex(str) {
        let data = new Uint8Array(16);
        for(let i = 0; i < 16; i += 1){
            data[i] = parseInt(str.substr(i * 2, 2), 16);
        }
        return new UFOID(data);
    }
    toHex() {
        return Array.from(this.data).map((__byte)=>__byte.toString(16).padStart(2, "0")).join("");
    }
    toUint32Array() {
        return new Uint32Array(this.data.buffer, 0, 4);
    }
    toId() {
        return this.data.slice();
    }
    toValue(b = new Uint8Array(32)) {
        b.subarray(0, 16).fill(0);
        b.subarray(16, 32).set(this.data);
        return b;
    }
}
function encoder(v1, b) {
    v1.toValue(b);
    return null;
}
function decoder(b, blob) {
    return UFOID.fromValue(b);
}
function factory() {
    return UFOID.now();
}
const schema = {
    encoder,
    decoder,
    factory
};
const VALUE_SIZE = 32;
const A_END = 16 + 16;
const V_START = 16 + 16;
const V_END = 16 + 16 + 32;
const E = (trible)=>trible.subarray(0, 16);
const A = (trible)=>trible.subarray(16, A_END);
const V = (trible)=>trible.subarray(V_START, V_END);
function scrambleEAV(trible) {
    return trible;
}
function scrambleEVA(trible) {
    const indexOrderedKey = new Uint8Array(64);
    indexOrderedKey.set(E(trible), 0);
    indexOrderedKey.set(V(trible), 16);
    indexOrderedKey.set(A(trible), 48);
    indexOrderedKey.__cached_hash = trible.__cached_hash;
    return indexOrderedKey;
}
function scrambleAEV(trible) {
    const indexOrderedKey = new Uint8Array(64);
    indexOrderedKey.set(A(trible), 0);
    indexOrderedKey.set(E(trible), 16);
    indexOrderedKey.set(V(trible), 32);
    indexOrderedKey.__cached_hash = trible.__cached_hash;
    return indexOrderedKey;
}
function scrambleAVE(trible) {
    const indexOrderedKey = new Uint8Array(64);
    indexOrderedKey.set(A(trible), 0);
    indexOrderedKey.set(V(trible), 16);
    indexOrderedKey.set(E(trible), 48);
    indexOrderedKey.__cached_hash = trible.__cached_hash;
    return indexOrderedKey;
}
function scrambleVEA(trible) {
    const indexOrderedKey = new Uint8Array(64);
    indexOrderedKey.set(V(trible), 0);
    indexOrderedKey.set(E(trible), 32);
    indexOrderedKey.set(A(trible), 48);
    indexOrderedKey.__cached_hash = trible.__cached_hash;
    return indexOrderedKey;
}
function scrambleVAE(trible) {
    const indexOrderedKey = new Uint8Array(64);
    indexOrderedKey.set(V(trible), 0);
    indexOrderedKey.set(A(trible), 32);
    indexOrderedKey.set(E(trible), 48);
    indexOrderedKey.__cached_hash = trible.__cached_hash;
    return indexOrderedKey;
}
const equalValue = (valueA, valueB)=>{
    const viewA = new Uint32Array(valueA.buffer, valueA.byteOffset, 8);
    const viewB = new Uint32Array(valueB.buffer, valueB.byteOffset, 8);
    for(let i = 0; i < 8; i++){
        if (viewA[i] !== viewB[i]) return false;
    }
    return true;
};
function bytesToUuid(bytes1) {
    const bits = [
        ...bytes1
    ].map((bit)=>{
        const s = bit.toString(16);
        return bit < 0x10 ? "0" + s : s;
    });
    return [
        ...bits.slice(0, 4),
        "-",
        ...bits.slice(4, 6),
        "-",
        ...bits.slice(6, 8),
        "-",
        ...bits.slice(8, 10),
        "-",
        ...bits.slice(10, 16)
    ].join("");
}
function uuidToBytes(uuid) {
    const bytes1 = [];
    uuid.replace(/[a-fA-F0-9]{2}/g, (hex)=>{
        bytes1.push(parseInt(hex, 16));
        return "";
    });
    return bytes1;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validate(id) {
    return UUID_RE.test(id);
}
const mod = {
    validate: validate
};
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
function uuidEncoder(v1, b) {
    if (!mod.validate(v1)) {
        throw Error("Provided value is not an encodable uuid.");
    }
    if (v1 === NIL_UUID) {
        throw Error("Can't encode NIL uuid.");
    }
    b.fill(0, 0, b.length - 16);
    b.set(uuidToBytes(v1), b.length - 16);
    return null;
}
function uuidDecoder(b, blob) {
    return bytesToUuid(b.subarray(b.length - 16));
}
const schema1 = {
    encoder: uuidEncoder,
    decoder: uuidDecoder,
    factory: mod
};
function shortstringEncoder(v1, b) {
    const d = new TextEncoder("utf-8").encode(v1);
    if (d.length > 32) {
        throw Error("String is too long for encoding.");
    }
    for(let i = 0; i < 32; i++){
        if (i < d.byteLength) {
            b[i] = d[i];
        } else {
            b[i] = 0;
        }
    }
    return null;
}
function shortstringDecoder(b, blob) {
    const i = b.indexOf(0);
    if (i !== -1) {
        b = b.subarray(0, i);
    }
    return new TextDecoder("utf-8").decode(b);
}
const schema2 = {
    encoder: shortstringEncoder,
    decoder: shortstringDecoder
};
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const lookup = new Uint8Array(256);
for(let i = 0; i < CHARS.length; i++){
    lookup[CHARS.charCodeAt(i)] = i;
}
function decode(base64) {
    let bufferLength = base64.length * 0.75;
    const len = base64.length;
    if (base64[len - 1] === "=") bufferLength--;
    if (base64[len - 2] === "=") bufferLength--;
    const bytes1 = new Uint8Array(bufferLength);
    let p = 0;
    for(let i = 0; i < len; i += 4){
        const encoded1 = lookup[base64.charCodeAt(i)];
        const encoded2 = lookup[base64.charCodeAt(i + 1)];
        const encoded3 = lookup[base64.charCodeAt(i + 2)];
        const encoded4 = lookup[base64.charCodeAt(i + 3)];
        bytes1[p++] = encoded1 << 2 | encoded2 >> 4;
        bytes1[p++] = (encoded2 & 15) << 4 | encoded3 >> 2;
        bytes1[p++] = (encoded3 & 3) << 6 | encoded4 & 63;
    }
    return bytes1.buffer;
}
const base64 = "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";
const buffer = decode(base64);
const module = await WebAssembly.compile(buffer);
const instance = await WebAssembly.instantiate(module, {});
const _global_hash_secret = new Uint8Array(instance.exports.memory.buffer, instance.exports.global_hash_secret, 16);
const _global_hash_this = new Uint8Array(instance.exports.memory.buffer, instance.exports.global_hash_this, 16);
const _global_hash_other = new Uint8Array(instance.exports.memory.buffer, instance.exports.global_hash_other, 16);
const _global_hash_data = new Uint8Array(instance.exports.memory.buffer, instance.exports.global_hash_data, 64);
crypto.getRandomValues(_global_hash_secret);
function hash_digest(data) {
    _global_hash_data.set(data);
    instance.exports.hash_digest(data.length);
    return new Uint8Array(_global_hash_this);
}
function hash_combine(l, r) {
    _global_hash_this.set(l);
    _global_hash_other.set(r);
    instance.exports.hash_xor();
    return new Uint8Array(_global_hash_this);
}
function hash_update(combined_hash, old_hash, new_hash) {
    _global_hash_this.set(combined_hash);
    _global_hash_other.set(old_hash);
    instance.exports.hash_xor();
    _global_hash_other.set(new_hash);
    instance.exports.hash_xor();
    return new Uint8Array(_global_hash_this);
}
function hash_equal(l, r) {
    _global_hash_this.set(l);
    _global_hash_other.set(r);
    return instance.exports.hash_equal() === 1;
}
const blake_buffer_size = 1024;
const _global_blake2b256_out = new Uint8Array(instance.exports.memory.buffer, instance.exports.global_blake2b256_out, 32);
const _global_blake2b256_buffer = new Uint8Array(instance.exports.memory.buffer, instance.exports.global_blake2b256_buffer, 1024);
function blake2b256(data, out) {
    let i = 0;
    for(; i + 1024 < data.length; i += blake_buffer_size){
        _global_blake2b256_buffer.set(data.subarray(i, i + 1024), i);
        instance.exports.blake2b256_update(1024);
    }
    _global_blake2b256_buffer.set(data.subarray(i, data.length), i);
    instance.exports.blake2b256_update(data.length - i);
    instance.exports.blake2b256_finish();
    out.set(_global_blake2b256_out);
}
const serialize_max_size = 128 + 1021 * 64;
const _global_serialize_secret = new Uint8Array(instance.exports.memory.buffer, instance.exports._global_serialize_secret, 32);
const _global_serialize_buffer = new Uint8Array(instance.exports.memory.buffer, instance.exports._global_serialize_buffer, serialize_max_size);
const _global_serialize_buffer_metaid = new Uint8Array(instance.exports.memory.buffer, instance.exports._global_serialize_buffer + 112, 16);
function setMetaId(metaId) {
    _global_serialize_buffer_metaid.set(metaId);
}
const _global_serialize_buffer_tribles = new Uint8Array(instance.exports.memory.buffer, instance.exports._global_serialize_buffer + 128, 1021 * 64);
function setTrible(i, trible) {
    _global_serialize_buffer_tribles.subarray(i * TRIBLE_SIZE, (i + 1) * TRIBLE_SIZE).set(trible);
}
function sign(secret, trible_count) {
    _global_serialize_secret.set(secret);
    if (!instance.exports.sign(trible_count)) throw "Failed to sign tribles!";
    return _global_serialize_buffer.subarray(0, _global_serialize_buffer_tribles + trible_count * 64);
}
function longstringEncoder(v1, b) {
    const d = new TextEncoder("utf-8").encode(v1);
    blake2b256(d, b);
    return d;
}
async function longstringDecoder(b, blob) {
    return new TextDecoder("utf-8").decode(await blob());
}
const schema3 = {
    encoder: longstringEncoder,
    decoder: longstringDecoder
};
const bigIntToBytes = (bn, b, offset, length)=>{
    let n = BigInt(bn);
    for(let i = offset + length - 1; offset <= i; i--){
        b[i] = new Number(n & 0xffn);
        n = n >> 8n;
    }
    return b;
};
const bytesToBigInt = (b, offset, length)=>{
    let n = 0n;
    const end = offset + length;
    for(let i = offset; i < end; i++){
        n = n << 8n;
        n = n | BigInt(b[i]);
    }
    return n;
};
const spreadBits = (x)=>{
    let X = BigInt(x);
    X = (X | X << 64n) & 0b000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111n;
    X = (X | X << 32n) & 0b000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111n;
    X = (X | X << 16n) & 0b000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111n;
    X = (X | X << 8n) & 0b000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111n;
    X = (X | X << 4n) & 0b000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011n;
    X = (X | X << 2n) & 0b001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001n;
    return X;
};
const unspreadBits = (x)=>{
    let X = BigInt(x);
    X = X & 0b001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001n;
    X = (X | X >> 2n) & 0b000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011n;
    X = (X | X >> 4n) & 0b000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111n;
    X = (X | X >> 8n) & 0b000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111n;
    X = (X | X >> 16n) & 0b000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111n;
    X = (X | X >> 32n) & 0b000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111n;
    X = (X | X >> 64n) & 0b1111111111111111111111111111111111111111111111111111111111111111n;
    return X;
};
function spacetimestampEncoder(v1, b) {
    const { t =0 , x =0 , y =0 , z =0  } = v1;
    if (t > 0xffffffffffffffffn) {
        throw Error("Error encoding spacetimestamp: Not in valid range: 0 <= t <= 2^64-1.");
    }
    if (z > 0xffffffffffffffffn) {
        throw Error("Error encoding spacetimestamp: Not in valid range: 0 <= z <= 2^64-1.");
    }
    if (y > 0xffffffffffffffffn) {
        throw Error("Error encoding spacetimestamp: Not in valid range: 0 <= y <= 2^64-1.");
    }
    if (x > 0xffffffffffffffffn) {
        throw Error("Error encoding spacetimestamp: Not in valid range: 0 <= x <= 2^64-1.");
    }
    const zyx = spreadBits(z) << 2n | spreadBits(y) << 1n | spreadBits(x);
    bigIntToBytes(t, b, 0, 8);
    bigIntToBytes(zyx, b, 8, 24);
    return null;
}
function spacetimestampDecoder(b, blob) {
    const t = bytesToBigInt(b, 0, 8);
    const zyx = bytesToBigInt(b, 8, 24);
    const z = unspreadBits(zyx >> 2n);
    const y = unspreadBits(zyx >> 1n);
    const x = unspreadBits(zyx);
    return {
        t,
        x,
        y,
        z
    };
}
const schema4 = {
    encoder: spacetimestampEncoder,
    decoder: spacetimestampDecoder
};
function subrangeEncoder(v1, b) {
    const view = new DataView(v1.buffer, v1.byteOffset, v1.byteLength);
    view.setBigUint64(0, v1.range_start);
    view.setBigUint64(8, v1.range_end);
    view.setBigUint64(16, v1.start);
    view.setBigUint64(24, v1.end);
    return null;
}
function subrangeDecoder(b, blob) {
    const view = new DataView(v.buffer, v.byteOffset, v.byteLength);
    const range_start = view.getBigUint64(0);
    const range_end = view.setBigUint64(8);
    const start = view.setBigUint64(16);
    const end = view.setBigUint64(24);
    return {
        range_start,
        range_end,
        start,
        end
    };
}
const schema5 = {
    encoder: subrangeEncoder,
    decoder: subrangeDecoder
};
function biguint256Encoder(v1, b) {
    if (v1 >= 1n << 256n || v1 < 0n) {
        throw Error("Error BigInt not in valid range: 0 <= v <= 2^256-1.");
    }
    bigIntToBytes(v1, b, 0, 32);
    return null;
}
function biguint256Decoder(b, blob) {
    return bytesToBigInt(b, 0, 32);
}
const schema6 = {
    encoder: biguint256Encoder,
    decoder: biguint256Decoder
};
function bigint256Encoder(v1, b) {
    if (v1 >= 1n << 255n || v1 < -(1n << 255n)) {
        throw Error("Error BigInt not in valid range: -2^255 <= v < 2^255.");
    }
    bigIntToBytes(BigInt(v1) + (1n << 255n), b, 0, 32);
    return null;
}
function bigint256Decoder(b, blob) {
    return bytesToBigInt(b, 0, 32) - (1n << 255n);
}
const schema7 = {
    encoder: bigint256Encoder,
    decoder: bigint256Decoder
};
const hexTable = new TextEncoder().encode("0123456789abcdef");
function errInvalidByte(__byte) {
    return new TypeError(`Invalid byte '${String.fromCharCode(__byte)}'`);
}
function errLength() {
    return new RangeError("Odd length hex string");
}
function fromHexChar(__byte) {
    if (48 <= __byte && __byte <= 57) return __byte - 48;
    if (97 <= __byte && __byte <= 102) return __byte - 97 + 10;
    if (65 <= __byte && __byte <= 70) return __byte - 65 + 10;
    throw errInvalidByte(__byte);
}
function encode(src) {
    const dst = new Uint8Array(src.length * 2);
    for(let i = 0; i < dst.length; i++){
        const v1 = src[i];
        dst[i * 2] = hexTable[v1 >> 4];
        dst[i * 2 + 1] = hexTable[v1 & 0x0f];
    }
    return dst;
}
function decode1(src) {
    const dst = new Uint8Array(src.length / 2);
    for(let i = 0; i < dst.length; i++){
        const a = fromHexChar(src[i * 2]);
        const b = fromHexChar(src[i * 2 + 1]);
        dst[i] = a << 4 | b;
    }
    if (src.length % 2 == 1) {
        fromHexChar(src[dst.length * 2]);
        throw errLength();
    }
    return dst;
}
function hexEncoder(value, b) {
    if (value.length !== 64) {
        throw Error("Couldn't encode hex value: Length must be exactly 64 (left padded with 0s).");
    }
    const bytes1 = decode1(new TextEncoder().encode(value));
    for(let i = 0; i < bytes1.length - b.length; i++){
        if (bytes1[i] !== 0) {
            throw Error("Couldn't encode hex value as id: Too large non zero prefix.");
        }
    }
    b.fill(0);
    b.set(bytes1.subarray(bytes1.length - b.length));
    return null;
}
function hexDecoder(bytes1, blob) {
    return new TextDecoder().decode(encode(bytes1)).padStart(64, "0");
}
function hexFactory() {
    const bytes1 = new Uint8Array(32);
    crypto.getRandomValues(bytes1.subarray(16, 32));
    return new TextDecoder().decode(encode(bytes1)).padStart(64, "0");
}
const schema8 = {
    encoder: hexEncoder,
    decoder: hexDecoder,
    factory: hexFactory
};
function rgbaEncoder({ r =0 , g =0 , b =0 , a =1  }, buff) {
    const view = new DataView(buff.buffer, buff.byteOffset, buff.byteLength);
    view.setFloat64(0, a);
    view.setFloat64(8, r);
    view.setFloat64(16, g);
    view.setFloat64(24, b);
    return null;
}
function rgbaDecoder(buff, blob) {
    const view = new DataView(buff.buffer, buff.byteOffset, buff.byteLength);
    const a = view.getFloat64(0);
    const r = view.getFloat64(8);
    const g = view.getFloat64(16);
    const b = view.getFloat64(24);
    return {
        r,
        g,
        b,
        a
    };
}
const schema9 = {
    encoder: rgbaEncoder,
    decoder: rgbaDecoder
};
const types = {
    ufoid: schema,
    uuid: schema1,
    shortstring: schema2,
    longstring: schema3,
    spacetimestamp: schema4,
    subrange: schema5,
    biguint256: schema6,
    bigint256: schema7,
    hex: schema8,
    rgba: schema9
};
const highBit32 = 1 << 31 >>> 0;
function ctz32(n) {
    n |= n << 16;
    n |= n << 8;
    n |= n << 4;
    n |= n << 2;
    n |= n << 1;
    return 32 - Math.clz32(~n);
}
function popcnt32(n) {
    n = n - (n >> 1 & 0x55555555);
    n = (n & 0x33333333) + (n >> 2 & 0x33333333);
    return (n + (n >> 4) & 0xF0F0F0F) * 0x1010101 >> 24;
}
class ByteBitset {
    constructor(u32array = new Uint32Array(8)){
        this.u32array = u32array;
    }
    copy() {
        return new ByteBitset(this.u32array.slice());
    }
    *entries() {
        for(let wordPosition = 0; wordPosition < 8; wordPosition++){
            for(let mask = 0xffffffff;;){
                const c = Math.clz32(this.u32array[wordPosition] & mask);
                if (c === 32) break;
                yield (wordPosition << 5) + c;
                mask &= ~(highBit32 >>> c);
            }
        }
    }
    count() {
        return popcnt32(this.u32array[0]) + popcnt32(this.u32array[1]) + popcnt32(this.u32array[2]) + popcnt32(this.u32array[3]) + popcnt32(this.u32array[4]) + popcnt32(this.u32array[5]) + popcnt32(this.u32array[6]) + popcnt32(this.u32array[7]);
    }
    has(__byte) {
        return (this.u32array[__byte >>> 5] & highBit32 >>> __byte) !== 0;
    }
    set(__byte) {
        this.u32array[__byte >>> 5] |= highBit32 >>> __byte;
    }
    unset(__byte) {
        this.u32array[__byte >>> 5] &= ~(highBit32 >>> __byte);
    }
    next(__byte) {
        let wordPosition = __byte >>> 5;
        const mask = ~0 >>> __byte;
        const c = Math.clz32(this.u32array[wordPosition] & mask);
        if (c < 32) return (wordPosition << 5) + c;
        for(wordPosition++; wordPosition < 8; wordPosition++){
            const c1 = Math.clz32(this.u32array[wordPosition]);
            if (c1 < 32) return (wordPosition << 5) + c1;
        }
        return null;
    }
    prev(__byte) {
        let wordPosition = __byte >>> 5;
        const mask = ~(~highBit32 >>> __byte) >>> 0;
        const c = ctz32(this.u32array[wordPosition] & mask);
        if (c < 32) return (wordPosition << 5) + (31 - c);
        for(wordPosition--; 0 <= wordPosition; wordPosition--){
            const c1 = ctz32(this.u32array[wordPosition]);
            if (c1 < 32) return (wordPosition << 5) + (31 - c1);
        }
        return null;
    }
    drainNext() {
        const __byte = this.next(0);
        if (__byte !== null) {
            this.unset(__byte);
        }
        return __byte;
    }
    drainPrev() {
        const __byte = this.prev(255);
        if (__byte !== null) {
            this.unset(__byte);
        }
        return __byte;
    }
    singleIntersect(__byte) {
        if (this.has(__byte)) {
            this.unsetAll();
            this.set(__byte);
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
    setRange(fromByte, toByte) {
        let fromWordPosition = fromByte >>> 5;
        let toWordPosition = toByte >>> 5;
        for(let wordPosition = 0; wordPosition < fromWordPosition; wordPosition++){
            this.u32array[wordPosition] = 0;
        }
        for(let wordPosition1 = fromWordPosition; wordPosition1 <= toWordPosition; wordPosition1++){
            this.u32array[wordPosition1] = ~0;
        }
        for(let wordPosition2 = toWordPosition + 1; wordPosition2 < 8; wordPosition2++){
            this.u32array[wordPosition2] = 0;
        }
        this.u32array[fromWordPosition] &= ~0 >>> fromByte;
        this.u32array[toWordPosition] &= ~(~highBit32 >>> toByte);
        return this;
    }
    isEmpty() {
        return this.u32array[0] === 0 && this.u32array[1] === 0 && this.u32array[2] === 0 && this.u32array[3] === 0 && this.u32array[4] === 0 && this.u32array[5] === 0 && this.u32array[6] === 0 && this.u32array[7] === 0;
    }
    isSupersetOf(other) {
        return (this.u32array[0] & other.u32array[0] ^ other.u32array[0]) === 0 && (this.u32array[1] & other.u32array[1] ^ other.u32array[1]) === 0 && (this.u32array[2] & other.u32array[2] ^ other.u32array[2]) === 0 && (this.u32array[3] & other.u32array[3] ^ other.u32array[3]) === 0 && (this.u32array[4] & other.u32array[4] ^ other.u32array[4]) === 0 && (this.u32array[5] & other.u32array[5] ^ other.u32array[5]) === 0 && (this.u32array[6] & other.u32array[6] ^ other.u32array[6]) === 0 && (this.u32array[7] & other.u32array[7] ^ other.u32array[7]) === 0;
    }
    isSubsetOf(other) {
        return (this.u32array[0] & other.u32array[0] ^ this.u32array[0]) === 0 && (this.u32array[1] & other.u32array[1] ^ this.u32array[1]) === 0 && (this.u32array[2] & other.u32array[2] ^ this.u32array[2]) === 0 && (this.u32array[3] & other.u32array[3] ^ this.u32array[3]) === 0 && (this.u32array[4] & other.u32array[4] ^ this.u32array[4]) === 0 && (this.u32array[5] & other.u32array[5] ^ this.u32array[5]) === 0 && (this.u32array[6] & other.u32array[6] ^ this.u32array[6]) === 0 && (this.u32array[7] & other.u32array[7] ^ this.u32array[7]) === 0;
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
class ByteBitsetArray {
    constructor(length){
        this.length = length;
        this.buffer = new Uint32Array(length * 8);
    }
    get(offset) {
        return new ByteBitset(this.buffer.subarray(offset * 8, (offset + 1) * 8));
    }
}
const LOWER = (value)=>value.subarray(16, 32);
const MODE_PATH = 0;
const MODE_BRANCH = 1;
const MODE_BACKTRACK = 2;
function VariableIterator(constraint, key_state) {
    return {
        branch_points: new ByteBitset().unsetAll(),
        branch_state: new ByteBitsetArray(32),
        key_state: key_state,
        mode: 0,
        depth: 0,
        constraint: constraint,
        [Symbol.iterator] () {
            return this;
        },
        next (cancel) {
            if (cancel) {
                while(0 < this.depth){
                    this.depth -= 1;
                    this.constraint.popByte();
                }
                this.mode = MODE_PATH;
                return {
                    done: true,
                    value: undefined
                };
            }
            outer: while(true){
                switch(this.mode){
                    case 0:
                        while(this.depth < this.key_state.length){
                            const __byte = this.constraint.peekByte();
                            if (__byte !== null) {
                                this.key_state[this.depth] = __byte;
                                this.constraint.pushByte(__byte);
                                this.depth += 1;
                            } else {
                                this.constraint.proposeByte(this.branch_state.get(this.depth));
                                this.branch_points.set(this.depth);
                                this.mode = MODE_BRANCH;
                                continue outer;
                            }
                        }
                        this.mode = MODE_BACKTRACK;
                        return {
                            done: false,
                            value: this.key_state
                        };
                    case 1:
                        const byte1 = this.branch_state.get(this.depth).drainNext();
                        if (byte1 !== null) {
                            this.key_state[this.depth] = byte1;
                            this.constraint.pushByte(byte1);
                            this.depth += 1;
                            this.mode = MODE_PATH;
                            continue outer;
                        } else {
                            this.branch_points.unset(this.depth);
                            this.mode = MODE_BACKTRACK;
                            continue outer;
                        }
                    case 2:
                        const parent_depth = this.branch_points.prev(255);
                        if (parent_depth !== null) {
                            while(parent_depth < this.depth){
                                this.depth -= 1;
                                this.constraint.popByte();
                            }
                            this.mode = MODE_BRANCH;
                            continue outer;
                        } else {
                            while(0 < this.depth){
                                this.depth -= 1;
                                this.constraint.popByte();
                            }
                            return {
                                done: true,
                                value: undefined
                            };
                        }
                }
            }
        }
    };
}
class Bindings {
    constructor(length, buffer = new Uint8Array(length * 32)){
        this.length = length;
        this.buffer = buffer;
    }
    get(offset) {
        return this.buffer.subarray(offset * 32, (offset + 1) * 32);
    }
    copy() {
        return new Bindings(this.length, this.buffer.slice());
    }
}
class Query {
    constructor(constraint, vars, postprocessing = (r)=>r){
        this.constraint = constraint;
        this.vars = vars;
        this.postprocessing = postprocessing;
        this.unexploredVariables = new ByteBitset();
        constraint.variables(this.unexploredVariables);
        const variableCount = this.unexploredVariables.count();
        this.bindings = new Bindings(variableCount);
    }
    *[Symbol.iterator]() {
        for (const binding of this.__resolve()){
            yield this.postprocessing(this.vars, binding);
        }
    }
    *__resolve() {
        if (this.unexploredVariables.isEmpty()) {
            yield this.bindings.copy();
        } else {
            let nextVariable;
            let nextVariableCosts = Number.MAX_VALUE;
            const variables = new ByteBitset();
            this.constraint.blocked(variables);
            variables.setSubtraction(this.unexploredVariables, variables);
            if (variables.isEmpty()) {
                throw new Error("Can't evaluate query: blocked dead end.");
            }
            for (const variable of variables.entries()){
                const costs = this.constraint.variableCosts(variable);
                if (costs <= nextVariableCosts) {
                    nextVariable = variable;
                    nextVariableCosts = costs;
                }
                if (nextVariableCosts <= 1) break;
            }
            this.unexploredVariables.unset(nextVariable);
            this.constraint.pushVariable(nextVariable);
            const variableAssignments = VariableIterator(this.constraint, this.bindings.get(nextVariable));
            for (const _ of variableAssignments){
                yield* this.__resolve();
            }
            this.constraint.popVariable();
            this.unexploredVariables.set(nextVariable);
        }
    }
}
class Variable {
    constructor(provider, index, name = null){
        this.provider = provider;
        this.index = index;
        this.name = name;
        this.decoder = null;
        this.encoder = null;
        this.blobcache = null;
    }
    toString() {
        if (this.name) {
            return `${this.name}@${this.index}`;
        }
        return `__anon__@${this.index}`;
    }
    typed({ encoder , decoder  }) {
        this.encoder = encoder;
        this.decoder = decoder;
        return this;
    }
    proposeBlobCache(blobcache) {
        this.blobcache ||= blobcache;
        return this;
    }
}
class UnnamedSequence {
    constructor(provider){
        this.provider = provider;
    }
    [Symbol.iterator]() {
        return this;
    }
    next() {
        const variable = new Variable(this.provider, this.provider.nextVariableIndex);
        this.provider.unnamedVariables.push(variable);
        this.provider.variables.push(variable);
        this.provider.nextVariableIndex++;
        return {
            value: variable
        };
    }
}
class VariableProvider {
    constructor(){
        this.nextVariableIndex = 0;
        this.variables = [];
        this.unnamedVariables = [];
        this.namedVariables = new Map();
        this.constantVariables = [];
        this.isBlocking = [];
        this.projected = new Set();
    }
    namedVars() {
        return new Proxy({}, {
            get: (_, name)=>{
                let variable = this.namedVariables.get(name);
                if (variable) {
                    return variable;
                }
                variable = new Variable(this, this.nextVariableIndex, name);
                this.namedVariables.set(name, variable);
                this.variables.push(variable);
                this.projected.add(this.nextVariableIndex);
                this.nextVariableIndex++;
                return variable;
            }
        });
    }
    unnamedVars() {
        return new UnnamedSequence(this);
    }
}
function decodeWithBlobcache(vars, binding) {
    const result = {};
    for (const { index , decoder , name , blobcache  } of vars.namedVariables.values()){
        const encoded = binding.get(index);
        const decoded = decoder(encoded, async ()=>await blobcache.get(encoded.slice()));
        result[name] = decoded;
    }
    return result;
}
function find1(queryfn, postprocessing = decodeWithBlobcache) {
    const vars = new VariableProvider();
    const constraint = queryfn(vars.namedVars(), vars.unnamedVars());
    return new Query(constraint, vars, postprocessing);
}
class IntersectionConstraint {
    constructor(constraints){
        this.constraints = constraints;
        this.activeConstraints = [];
        this.variableStack = [];
    }
    peekByte() {
        let __byte = null;
        for (const constraint of this.activeConstraints){
            const peeked = constraint.peekByte();
            if (peeked !== null) {
                if (__byte === null) {
                    __byte = peeked;
                }
                if (__byte !== peeked) return null;
            } else {
                return null;
            }
        }
        return __byte;
    }
    proposeByte(bitset) {
        bitset.setAll();
        let b = new ByteBitset().unsetAll();
        for (const constraint of this.activeConstraints){
            constraint.proposeByte(b);
            bitset.setIntersection(bitset, b);
        }
    }
    pushByte(__byte) {
        for (const constraint of this.activeConstraints){
            constraint.pushByte(__byte);
        }
    }
    popByte() {
        for (const constraint of this.activeConstraints){
            constraint.popByte();
        }
    }
    variables(bitset) {
        bitset.unsetAll();
        let b = new ByteBitset().unsetAll();
        for (const constraint of this.constraints){
            constraint.variables(b);
            bitset.setUnion(bitset, b);
        }
    }
    blocked(bitset) {
        bitset.unsetAll();
        let b = new ByteBitset().unsetAll();
        for (const constraint of this.constraints){
            constraint.blocked(b);
            bitset.setUnion(bitset, b);
        }
    }
    pushVariable(variable) {
        this.variableStack.push(variable);
        this.activeConstraints.length = 0;
        let b = new ByteBitset().unsetAll();
        for (const constraint of this.constraints){
            constraint.variables(b);
            if (b.has(variable)) {
                constraint.pushVariable(variable);
                this.activeConstraints.push(constraint);
            }
        }
    }
    popVariable() {
        this.variableStack.pop();
        for (const constraint of this.activeConstraints){
            constraint.popVariable();
        }
        this.activeConstraints.length = 0;
        if (0 < this.variableStack.length) {
            const currentVariable = this.variableStack[this.variableStack.length - 1];
            let b = new ByteBitset();
            for (const constraint1 of this.constraints){
                constraint1.variables(b);
                if (b.has(currentVariable)) {
                    this.activeConstraints.push(constraint1);
                }
            }
        }
    }
    variableCosts(variable) {
        let min = Number.MAX_VALUE;
        let b = new ByteBitset().unsetAll();
        for (const constraint of this.constraints){
            constraint.variables(b);
            if (b.has(variable)) {
                min = Math.min(min, constraint.variableCosts(variable));
            }
        }
        return min;
    }
}
function and(...constraints) {
    return new IntersectionConstraint(constraints);
}
class ConstantConstraint {
    constructor(variable, constant){
        this.variable = variable;
        this.constant = constant;
        this.depth = 0;
    }
    peekByte() {
        return this.constant[this.depth];
    }
    proposeByte(bitset) {
        bitset.unsetAll();
        bitset.set(this.constant[this.depth]);
    }
    popByte() {
        this.depth--;
    }
    pushByte(_byte) {
        this.depth++;
    }
    variables(bitset) {
        bitset.unsetAll();
        bitset.set(this.variable);
    }
    blocked(bitset) {
        bitset.unsetAll();
    }
    pushVariable(_variable) {}
    popVariable() {}
    variableCosts(_variable) {
        return 1;
    }
}
function constant(variable, constant) {
    if (constant.length !== 32) throw new Error("Bad constant length.");
    return new ConstantConstraint(variable.index, constant);
}
class IndexConstraint {
    constructor(variable, index){
        this.cursor = index.cursor();
        this.variable = variable;
    }
    peekByte() {
        return this.cursor.peek();
    }
    proposeByte(bitset) {
        this.cursor.propose(bitset);
    }
    pushByte(__byte) {
        this.cursor.push(__byte);
    }
    popByte() {
        this.cursor.pop();
    }
    variables(bitset) {
        bitset.unsetAll();
        bitset.set(this.variable);
    }
    blocked(bitset) {
        bitset.unsetAll();
    }
    pushVariable(_variable) {}
    popVariable() {}
    variableCosts(_variable) {
        return this.cursor.segmentCount();
    }
}
function indexed(variable, index) {
    return new IndexConstraint(variable.index, index);
}
function collection(variable, collection) {
    const indexBatch = emptyValuePACT.batch();
    for (const c of collection){
        indexBatch.put(c);
    }
    const index = indexBatch.complete();
    return new IndexConstraint(variable.index, index);
}
class MaskedConstraint {
    constructor(constraint, maskedVariables){
        this.constraint = constraint;
        this.mask = new ByteBitset();
        for (const v1 of maskedVariables){
            this.mask.set(v1);
        }
    }
    peekByte() {
        return this.constraint.peekByte();
    }
    proposeByte(bitset) {
        return this.constraint.proposeByte(bitset);
    }
    pushByte(__byte) {
        return this.constraint.pushByte(__byte);
    }
    popByte() {
        return this.constraint.popByte();
    }
    variables(bitset) {
        this.constraint.variables(bitset);
        bitset.setSubtraction(bitset, this.mask);
    }
    blocked(bitset) {
        this.constraint.blocked(bitset);
    }
    pushVariable(variable) {
        this.constraint.pushVariable(variable);
    }
    popVariable() {
        this.constraint.popVariable();
    }
    variableCosts(variable) {
        return this.constraint.variableCosts(variable);
    }
}
function masked(constraint, maskedVariables) {
    return new MaskedConstraint(constraint, maskedVariables.map((v1)=>v1.index));
}
function PACTHash(key) {
    if (key.__cached_hash === undefined) {
        key.__cached_hash = hash_digest(key);
    }
    return key.__cached_hash;
}
const PaddedCursor = class {
    constructor(cursor, segments, segment_size){
        this.cursor = cursor;
        this.depth = 0;
        this.padding = new ByteBitset().setAll();
        let depth = 0;
        for (const s of segments){
            const pad = segment_size - s;
            depth += pad;
            for(let j = pad; j < segment_size; j++){
                this.padding.unset(depth);
                depth += 1;
            }
        }
    }
    peek() {
        if (this.padding.has(this.depth)) return 0;
        return this.cursor.peek();
    }
    propose(bitset) {
        if (this.padding.has(this.depth)) {
            bitset.unsetAll();
            bitset.set(0);
        } else {
            this.cursor.propose(bitset);
        }
    }
    push(key_fragment) {
        if (!this.padding.has(this.depth)) {
            this.cursor.push(key_fragment);
        }
        this.depth += 1;
    }
    pop() {
        this.depth -= 1;
        if (!this.padding.has(this.depth)) {
            this.cursor.pop();
        }
    }
    segmentCount() {
        return this.cursor.segmentCount();
    }
};
class SegmentConstraint {
    constructor(pact, segmentVariables){
        if (pact.segments.length !== segmentVariables.length) {
            throw new Error("Number of segment variables must match the number of segments.");
        }
        if (new Set(segmentVariables).size !== segmentVariables.length) {
            throw new Error("Segment variables must be unique. Use explicit equality when inner constraints are required.");
        }
        this.nextVariableIndex = 0;
        this.cursor = new PaddedCursor(pact.cursor(), pact.segments, 32);
        this.segmentVariables = segmentVariables;
    }
    peekByte() {
        if (this.nextVariableIndex === 0) {
            throw new error("unreachable");
        }
        return this.cursor.peek();
    }
    proposeByte(bitset) {
        if (this.nextVariableIndex === 0) {
            throw new error("unreachable");
        }
        this.cursor.propose(bitset);
    }
    pushByte(__byte) {
        if (this.nextVariableIndex === 0) {
            throw new error("unreachable");
        }
        this.cursor.push(__byte);
    }
    popByte() {
        if (this.nextVariableIndex === 0) {
            throw new error("unreachable");
        }
        this.cursor.pop();
    }
    variables(bitset) {
        bitset.unsetAll();
        for (const variable of this.segmentVariables){
            bitset.set(variable);
        }
    }
    blocked(bitset) {
        bitset.unsetAll();
        for(let i = this.nextVariableIndex + 1; i < this.segmentVariables.length; i++){
            bitset.set(this.segmentVariables[i]);
        }
    }
    pushVariable(variable) {
        if (this.segmentVariables[this.nextVariableIndex] === variable) {
            this.nextVariableIndex++;
        }
    }
    popVariable() {
        if (this.nextVariableIndex === 0) {
            throw new error("unreachable");
        }
        this.nextVariableIndex--;
    }
    variableCosts(variable) {
        if (this.segmentVariables[this.nextVariableIndex] === variable) {
            return this.cursor.segmentCount();
        }
    }
}
const makePACT = function(segments) {
    const KEY_LENGTH = segments.reduce((a, n)=>a + n, 0);
    if (KEY_LENGTH > 128) {
        throw Error("Compressed key must not be longer than 128 bytes.");
    }
    const SEGMENT_LUT = new Uint8Array(KEY_LENGTH + 1);
    SEGMENT_LUT.set(segments.flatMap((l, i)=>new Array(l).fill(i)));
    SEGMENT_LUT[SEGMENT_LUT.length - 1] = SEGMENT_LUT[SEGMENT_LUT.length - 2];
    let PACTCursor;
    let PACTTree;
    let PACTBatch;
    let PACTLeaf;
    let PACTNode;
    PACTCursor = class {
        constructor(pact){
            this.pact = pact;
            this.depth = 0;
            this.path = new Array(KEY_LENGTH + 1).fill(null);
            this.path[0] = pact.child;
        }
        peek() {
            const node = this.path[this.depth];
            if (node === null) return null;
            return node.peek(this.depth);
        }
        propose(bitset) {
            const node = this.path[this.depth];
            if (node === null) {
                bitset.unsetAll();
            } else {
                node.propose(this.depth, bitset);
            }
        }
        pop() {
            this.depth--;
        }
        push(__byte) {
            const node = this.path[this.depth].get(this.depth, __byte);
            this.depth++;
            this.path[this.depth] = node;
        }
        segmentCount() {
            const node = this.path[this.depth];
            if (node === null) return 0;
            return node.segmentCount(this.depth);
        }
    };
    function _union(leftNode, rightNode, depth = 0, key = new Uint8Array(KEY_LENGTH)) {
        if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
            return leftNode;
        }
        const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
        for(; depth < maxDepth; depth++){
            const leftByte = leftNode.peek(depth);
            if (leftByte !== rightNode.peek(depth)) break;
            key[depth] = leftByte;
        }
        if (depth === KEY_LENGTH) return leftNode;
        const unionChildbits = new ByteBitset();
        const leftChildbits = new ByteBitset();
        const rightChildbits = new ByteBitset();
        const intersectChildbits = new ByteBitset();
        const children = [];
        let hash = new Uint8Array(16);
        let count = 0;
        let segmentCount = 0;
        leftNode.propose(depth, leftChildbits);
        rightNode.propose(depth, rightChildbits);
        unionChildbits.setUnion(leftChildbits, rightChildbits);
        intersectChildbits.setIntersection(leftChildbits, rightChildbits);
        leftChildbits.setSubtraction(leftChildbits, intersectChildbits);
        rightChildbits.setSubtraction(rightChildbits, intersectChildbits);
        for (let index of leftChildbits.entries()){
            const child = leftNode.get(depth, index);
            children[index] = child;
            hash = hash_combine(hash, child.hash);
            count += child.count();
            segmentCount += child.segmentCount(depth);
        }
        for (let index1 of rightChildbits.entries()){
            const child1 = rightNode.get(depth, index1);
            children[index1] = child1;
            hash = hash_combine(hash, child1.hash);
            count += child1.count();
            segmentCount += child1.segmentCount(depth);
        }
        for (let index2 of intersectChildbits.entries()){
            key[depth] = index2;
            const leftChild = leftNode.get(depth, index2);
            const rightChild = rightNode.get(depth, index2);
            const union = _union(leftChild, rightChild, depth + 1, key);
            children[index2] = union;
            hash = hash_combine(hash, union.hash);
            count += union.count();
            segmentCount += union.segmentCount(depth);
        }
        return new PACTNode(key.slice(), depth, unionChildbits, children, hash, count, segmentCount, {});
    }
    function _subtract(leftNode, rightNode, depth = 0, key = new Uint8Array(KEY_LENGTH)) {
        if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
            return null;
        }
        const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
        for(; depth < maxDepth; depth++){
            const leftByte = leftNode.peek(depth);
            if (leftByte !== rightNode.peek(depth)) {
                return leftNode;
            }
            key[depth] = leftByte;
        }
        if (depth === KEY_LENGTH) return null;
        const leftChildbits = new ByteBitset();
        const rightChildbits = new ByteBitset();
        const intersectChildbits = new ByteBitset();
        const children = [];
        let hash = new Uint8Array(16);
        let count = 0;
        let segmentCount = 0;
        leftNode.propose(depth, leftChildbits);
        rightNode.propose(depth, rightChildbits);
        intersectChildbits.setIntersection(leftChildbits, rightChildbits);
        leftChildbits.setSubtraction(leftChildbits, intersectChildbits);
        for (let index of leftChildbits.entries()){
            const child = leftNode.get(depth, index);
            children[index] = child;
            hash = hash_combine(hash, child.hash);
            count += child.count();
            segmentCount += child.segmentCount(depth);
        }
        for (let index1 of intersectChildbits.entries()){
            const leftChild = leftNode.get(depth, index1);
            const rightChild = rightNode.get(depth, index1);
            key[depth] = index1;
            const diff = _subtract(leftChild, rightChild, depth + 1);
            if (diff !== null) {
                leftChildbits.set(index1);
                children[index1] = diff;
                hash = hash_combine(hash, diff.hash);
                count += diff.count();
                segmentCount += diff.segmentCount(depth);
            }
        }
        if (leftChildbits.isEmpty()) return null;
        return new PACTNode(key.slice(), depth, leftChildbits, children, hash, count, segmentCount, {});
    }
    function _intersect(leftNode, rightNode, depth = 0, key = new Uint8Array(KEY_LENGTH)) {
        if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
            return leftNode;
        }
        const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
        for(; depth < maxDepth; depth++){
            const leftByte = leftNode.peek(depth);
            if (leftByte !== rightNode.peek(depth)) return null;
            key[depth] = leftByte;
        }
        if (depth === KEY_LENGTH) return leftNode;
        const leftChildbits = new ByteBitset();
        const rightChildbits = new ByteBitset();
        const intersectChildbits = new ByteBitset();
        const children = [];
        let hash = new Uint8Array(16);
        let count = 0;
        let segmentCount = 0;
        leftNode.propose(depth, leftChildbits);
        rightNode.propose(depth, rightChildbits);
        intersectChildbits.setIntersection(leftChildbits, rightChildbits);
        for (let index of intersectChildbits.entries()){
            const leftChild = leftNode.get(depth, index);
            const rightChild = rightNode.get(depth, index);
            key[depth] = index;
            const intersection = _intersect(leftChild, rightChild, depth + 1);
            if (intersection === null) {
                intersectChildbits.unset(index);
            } else {
                children[index] = intersection;
                hash = hash_combine(hash, intersection.hash);
                count += intersection.count();
                segmentCount += intersection.segmentCount(depth);
            }
        }
        if (intersectChildbits.isEmpty()) return null;
        return new PACTNode(key.slice(), depth, intersectChildbits, children, hash, count, segmentCount, {});
    }
    function _difference(leftNode, rightNode, depth = 0, key = new Uint8Array(KEY_LENGTH)) {
        if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
            return null;
        }
        const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
        for(; depth < maxDepth; depth++){
            const leftByte = leftNode.peek(depth);
            if (leftByte !== rightNode.peek(depth)) break;
            key[depth] = leftByte;
        }
        if (depth === KEY_LENGTH) return null;
        const leftChildbits = new ByteBitset().setAll();
        const rightChildbits = new ByteBitset().setAll();
        const intersectChildbits = new ByteBitset().unsetAll();
        const diffChildbits = new ByteBitset().unsetAll();
        const children = [];
        let hash = new Uint8Array(16);
        let count = 0;
        let segmentCount = 0;
        leftNode.propose(depth, leftChildbits);
        rightNode.propose(depth, rightChildbits);
        intersectChildbits.setIntersection(leftChildbits, rightChildbits);
        leftChildbits.setSubtraction(leftChildbits, intersectChildbits);
        rightChildbits.setSubtraction(rightChildbits, intersectChildbits);
        diffChildbits.setDifference(leftChildbits, rightChildbits);
        for (let index of leftChildbits.entries()){
            const child = leftNode.get(depth, index);
            children[index] = child;
            hash = hash_combine(hash, child.hash);
            count += child.count();
            segmentCount += child.segmentCount(depth);
        }
        for (let index1 of rightChildbits.entries()){
            const child1 = rightNode.get(depth, index1);
            children[index1] = child1;
            hash = hash_combine(hash, child1.hash);
            count += child1.count();
            segmentCount += child1.segmentCount(depth);
        }
        for (let index2 of intersectChildbits.entries()){
            const leftChild = leftNode.get(depth, index2);
            const rightChild = rightNode.get(depth, index2);
            key[depth] = index2;
            const difference = _difference(leftChild, rightChild, depth + 1);
            if (difference !== null) {
                diffChildbits.set(index2);
                children[index2] = difference;
                hash = hash_combine(hash, difference.hash);
                count += difference.count();
                segmentCount += difference.segmentCount(depth);
            }
        }
        if (diffChildbits.isEmpty()) return null;
        return new PACTNode(key.slice(), depth, diffChildbits, children, hash, count, segmentCount, {});
    }
    function _isSubsetOf(leftNode, rightNode, depth = 0) {
        if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
            return true;
        }
        const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
        for(; depth < maxDepth; depth++){
            if (leftNode.peek(depth) !== rightNode.peek(depth)) break;
        }
        if (depth === KEY_LENGTH) return true;
        const leftChildbits = new ByteBitset().setAll();
        const rightChildbits = new ByteBitset().setAll();
        const intersectChildbits = new ByteBitset().unsetAll();
        leftNode.propose(depth, leftChildbits);
        rightNode.propose(depth, rightChildbits);
        intersectChildbits.setIntersection(leftChildbits, rightChildbits);
        leftChildbits.setSubtraction(leftChildbits, intersectChildbits);
        if (!leftChildbits.isEmpty()) return false;
        for (let index of intersectChildbits.entries()){
            const leftChild = leftNode.get(depth, index);
            const rightChild = rightNode.get(depth, index);
            if (!_isSubsetOf(leftChild, rightChild, depth + 1)) {
                return false;
            }
        }
        return true;
    }
    function _isIntersecting(leftNode, rightNode, depth = 0) {
        if (hash_equal(leftNode.hash, rightNode.hash) || depth === KEY_LENGTH) {
            return true;
        }
        const maxDepth = Math.min(leftNode.branchDepth, rightNode.branchDepth);
        for(; depth < maxDepth; depth++){
            if (leftNode.peek(depth) !== rightNode.peek(depth)) {
                return false;
            }
        }
        if (depth === KEY_LENGTH) return true;
        const leftChildbits = new ByteBitset();
        const rightChildbits = new ByteBitset();
        const intersectChildbits = new ByteBitset();
        leftNode.propose(depth, leftChildbits);
        rightNode.propose(depth, rightChildbits);
        intersectChildbits.setIntersection(leftChildbits, rightChildbits);
        for (let index of intersectChildbits.entries()){
            const leftChild = leftNode.get(depth, index);
            const rightChild = rightNode.get(depth, index);
            if (_isIntersecting(leftChild, rightChild, depth + 1)) {
                return true;
            }
        }
        return false;
    }
    function* _walk(node, key = new Uint8Array(KEY_LENGTH), depth = 0) {
        for(; depth < node.branchDepth; depth++){
            key[depth] = node.peek(depth);
        }
        if (depth === KEY_LENGTH) {
            yield [
                key,
                node.value
            ];
        } else {
            for (let index of node.childbits.entries()){
                key[depth] = index;
                const child = node.get(depth, index);
                yield* _walk(child, key, depth + 1);
            }
        }
    }
    PACTBatch = class {
        constructor(child){
            this.child = child;
            this.owner = {};
            this.completed = false;
        }
        complete() {
            if (this.completed) throw Error("Batch already completed.");
            this.completed = true;
            return new PACTTree(this.child);
        }
        put(key, value = null) {
            if (this.completed) {
                throw Error("Can't put into already completed batch.");
            }
            if (this.child) {
                this.child = this.child.put(0, key, value, this.owner);
            } else {
                this.child = new PACTLeaf(0, key, value, PACTHash(key));
            }
            return this;
        }
    };
    PACTTree = class {
        constructor(child = null){
            this.keyLength = KEY_LENGTH;
            this.child = child;
            this.segments = segments;
        }
        batch() {
            return new PACTBatch(this.child);
        }
        count() {
            if (this.child === null) return 0;
            return this.child.count();
        }
        put(key, value = null) {
            if (this.child !== null) {
                const nchild = this.child.put(0, key, value, {});
                if (this.child === nchild) return this;
                return new PACTTree(nchild);
            }
            return new PACTTree(new PACTLeaf(0, key, value, PACTHash(key)));
        }
        get(key) {
            let node = this.child;
            if (node === null) return undefined;
            for(let depth = 0; depth < KEY_LENGTH; depth++){
                const sought = key[depth];
                node = node.get(depth, sought);
                if (node === null) return undefined;
            }
            return node.value;
        }
        segmentConstraint(vars) {
            return new SegmentConstraint(this, vars.map((v1)=>v1.index));
        }
        cursor() {
            return new PACTCursor(this);
        }
        isEmpty() {
            return this.child === null;
        }
        isEqual(other) {
            return this.child === other.child || this.keyLength === other.keyLength && !!this.child && !!other.child && hash_equal(this.child.hash, other.child.hash);
        }
        isSubsetOf(other) {
            return this.keyLength === other.keyLength && (!this.child || !!other.child && _isSubsetOf(this.child, other.child));
        }
        isIntersecting(other) {
            return this.keyLength === other.keyLength && !!this.child && !!other.child && (this.child === other.child || hash_equal(this.child.hash, other.child.hash) || _isIntersecting(this.child, other.child));
        }
        union(other) {
            const thisNode = this.child;
            const otherNode = other.child;
            if (thisNode === null) {
                return new PACTTree(otherNode);
            }
            if (otherNode === null) {
                return new PACTTree(thisNode);
            }
            return new PACTTree(_union(thisNode, otherNode));
        }
        subtract(other) {
            const thisNode = this.child;
            const otherNode = other.child;
            if (otherNode === null) {
                return new PACTTree(thisNode);
            }
            if (this.child === null || hash_equal(this.child.hash, other.child.hash)) {
                return new PACTTree();
            } else {
                return new PACTTree(_subtract(thisNode, otherNode));
            }
        }
        intersect(other) {
            const thisNode = this.child;
            const otherNode = other.child;
            if (thisNode === null || otherNode === null) {
                return new PACTTree(null);
            }
            if (thisNode === otherNode || hash_equal(thisNode.hash, otherNode.hash)) {
                return new PACTTree(otherNode);
            }
            return new PACTTree(_intersect(thisNode, otherNode));
        }
        difference(other) {
            const thisNode = this.child;
            const otherNode = other.child;
            if (thisNode === null) {
                return new PACTTree(otherNode);
            }
            if (otherNode === null) {
                return new PACTTree(thisNode);
            }
            if (thisNode === otherNode || hash_equal(thisNode.hash, otherNode.hash)) {
                return new PACTTree(null);
            }
            return new PACTTree(_difference(thisNode, otherNode));
        }
        *entries() {
            if (this.child === null) return;
            for (const [k, v1] of _walk(this.child)){
                yield [
                    k.slice(),
                    v1
                ];
            }
        }
        *keys() {
            if (this.child === null) return;
            for (const [k, v1] of _walk(this.child)){
                yield k.slice();
            }
        }
        *values() {
            if (this.child === null) return;
            for (const [k, v1] of _walk(this.child)){
                yield v1;
            }
        }
    };
    PACTLeaf = class {
        constructor(depth, key, value, hash){
            this.key = key.slice(depth);
            this.value = value;
            this.hash = hash;
            this.depth = depth;
            this.branchDepth = KEY_LENGTH;
        }
        count() {
            return 1;
        }
        segmentCount(_depth) {
            return 1;
        }
        peek(depth) {
            return this.key[depth - this.depth];
        }
        propose(depth, bitset) {
            bitset.unsetAll();
            bitset.set(this.key[depth - this.depth]);
        }
        get(depth, v1) {
            if (depth < KEY_LENGTH && this.key[depth - this.depth] === v1) return this;
            return null;
        }
        put(depth, key, value, owner) {
            while(depth < KEY_LENGTH && this.key[depth - this.depth] === key[depth]){
                depth += 1;
            }
            if (depth === KEY_LENGTH) {
                return this;
            }
            const sibling = new PACTLeaf(depth + 1, key, value, PACTHash(key));
            const branchChildren = [];
            const leftIndex = this.key[depth - this.depth];
            const rightIndex = key[depth];
            branchChildren[leftIndex] = this;
            branchChildren[rightIndex] = sibling;
            const branchChildbits = new ByteBitset().unsetAll();
            branchChildbits.set(leftIndex);
            branchChildbits.set(rightIndex);
            const hash = hash_combine(this.hash, sibling.hash);
            return new PACTNode(key, depth, branchChildbits, branchChildren, hash, 2, 2, owner);
        }
    };
    PACTNode = class {
        constructor(key, branchDepth, childbits, children, hash, count, segmentCount, owner){
            this.key = key;
            this.branchDepth = branchDepth;
            this.childbits = childbits;
            this.children = children;
            this.hash = hash;
            this._count = count;
            this._segmentCount = segmentCount;
            this.owner = owner;
        }
        count() {
            return this._count;
        }
        segmentCount(depth) {
            if (SEGMENT_LUT[depth] === SEGMENT_LUT[this.branchDepth]) {
                return this._segmentCount;
            } else {
                return 1;
            }
        }
        peek(depth) {
            if (depth < this.branchDepth) {
                return this.key[depth];
            } else {
                return null;
            }
        }
        propose(depth, bitset) {
            if (depth < this.branchDepth) {
                bitset.unsetAll();
                bitset.set(this.key[depth]);
            } else {
                bitset.setFrom(this.childbits);
            }
        }
        get(depth, v1) {
            if (depth === this.branchDepth) {
                if (this.childbits.has(v1)) return this.children[v1];
            } else {
                if (this.key[depth] === v1) return this;
            }
            return null;
        }
        put(depth, key, value, owner) {
            for(; depth < this.branchDepth; depth++){
                if (this.key[depth] !== key[depth]) break;
            }
            if (depth === this.branchDepth) {
                const pos = key[this.branchDepth];
                const childDepth = this.branchDepth + 1;
                let nchildbits;
                let nchild;
                let hash;
                let count;
                let segmentCount;
                if (this.childbits.has(pos)) {
                    const child = this.children[pos];
                    const oldChildHash = child.hash;
                    child.branchDepth;
                    const oldChildCount = child.count();
                    const oldChildSegmentCount = child.segmentCount(this.branchDepth);
                    nchild = child.put(childDepth, key, value, owner);
                    if (hash_equal(oldChildHash, nchild.hash)) return this;
                    hash = hash_update(this.hash, oldChildHash, nchild.hash);
                    count = this._count - oldChildCount + nchild.count();
                    segmentCount = this._segmentCount - oldChildSegmentCount + nchild.segmentCount(this.branchDepth);
                    if (this.owner === owner) {
                        this.children[pos] = nchild;
                        this.hash = hash;
                        this._count = count;
                        this._segmentCount = segmentCount;
                        return this;
                    }
                    nchildbits = this.childbits.copy();
                } else {
                    nchild = new PACTLeaf(depth + 1, key, value, PACTHash(key));
                    hash = hash_combine(this.hash, nchild.hash);
                    count = this._count + 1;
                    segmentCount = this._segmentCount + 1;
                    if (this.owner === owner) {
                        this.childbits.set(pos);
                        this.children[pos] = nchild;
                        this.hash = hash;
                        this._count = count;
                        this._segmentCount = segmentCount;
                        return this;
                    }
                    nchildbits = this.childbits.copy();
                    nchildbits.set(pos);
                }
                const nchildren = this.children.slice();
                nchildren[pos] = nchild;
                return new PACTNode(this.key, this.branchDepth, nchildbits, nchildren, hash, count, segmentCount, owner);
            }
            const nchild1 = new PACTLeaf(depth + 1, key, value, PACTHash(key));
            const nchildren1 = [];
            const lindex = this.key[depth];
            const rindex = key[depth];
            nchildren1[lindex] = this;
            nchildren1[rindex] = nchild1;
            const nchildbits1 = new ByteBitset().unsetAll();
            nchildbits1.set(lindex);
            nchildbits1.set(rindex);
            const count1 = this._count + 1;
            const segmentCount1 = SEGMENT_LUT[depth] === SEGMENT_LUT[this.branchDepth] ? this._segmentCount + 1 : 2;
            const hash1 = hash_combine(this.hash, nchild1.hash);
            return new PACTNode(this.key, depth, nchildbits1, nchildren1, hash1, count1, segmentCount1, owner);
        }
    };
    return new PACTTree();
};
const emptyIdIdValueTriblePACT = makePACT([
    16,
    16,
    32
]);
const emptyIdValueIdTriblePACT = makePACT([
    16,
    32,
    16
]);
const emptyValueIdIdTriblePACT = makePACT([
    32,
    16,
    16
]);
const emptyIdPACT = makePACT([
    16
]);
const emptyValuePACT1 = makePACT([
    32
]);
const stack_empty = 0;
const stack_e = 1;
const stack_a = 2;
const stack_v = 3;
const stack_ea = 4;
const stack_ev = 5;
const stack_ae = 6;
const stack_av = 7;
const stack_ve = 8;
const stack_va = 9;
const stack_eav = 10;
const stack_eva = 11;
const stack_aev = 12;
const stack_ave = 13;
const stack_vea = 14;
const stack_vae = 15;
function deserialize(tribleset, bytes1) {
    if (!commit_verify(bytes1)) {
        throw Error("Failed to verify serialized tribleset!");
    }
    const pubkey = bytes1.slice(16, 48);
    const metaId = bytes1.slice(112, 128);
    const dataset = tribleset.with(splitTribles(bytes1.subarray(commit_header_size)));
    return {
        pubkey,
        metaId,
        dataset
    };
}
function serialize(tribleset, metaId, secret) {
    setMetaId(metaId);
    const tribles_count = tribleset.count();
    const tribles = tribleset.tribles();
    let i = 0;
    for (const trible of tribles){
        setTrible(i, trible);
        i += 1;
    }
    return sign(secret, tribles_count);
}
class TribleConstraint {
    constructor(tribleSet, e, a, v1){
        if (e === a || e === v1 || a == v1) {
            throw new Error("Triple variables must be uniqe. Use explicit equality when inner constraints are required.");
        }
        this.state = stack_empty;
        this.eVar = e;
        this.aVar = a;
        this.vVar = v1;
        this.eavCursor = new PaddedCursor(tribleSet.EAV.cursor(), tribleSet.EAV.segments, 32);
        this.evaCursor = new PaddedCursor(tribleSet.EVA.cursor(), tribleSet.EVA.segments, 32);
        this.aevCursor = new PaddedCursor(tribleSet.AEV.cursor(), tribleSet.AEV.segments, 32);
        this.aveCursor = new PaddedCursor(tribleSet.AVE.cursor(), tribleSet.AVE.segments, 32);
        this.veaCursor = new PaddedCursor(tribleSet.VEA.cursor(), tribleSet.VEA.segments, 32);
        this.vaeCursor = new PaddedCursor(tribleSet.VAE.cursor(), tribleSet.VAE.segments, 32);
    }
    peekByte() {
        switch(this.state){
            case 0:
                throw new error("unreachable");
            case 1:
                return this.eavCursor.peek();
            case 2:
                return this.aevCursor.peek();
            case 3:
                return this.veaCursor.peek();
            case 4:
                return this.eavCursor.peek();
            case 5:
                return this.evaCursor.peek();
            case 6:
                return this.aevCursor.peek();
            case 7:
                return this.aveCursor.peek();
            case 8:
                return this.veaCursor.peek();
            case 9:
                return this.vaeCursor.peek();
            case 10:
                return this.eavCursor.peek();
            case 11:
                return this.evaCursor.peek();
            case 12:
                return this.aevCursor.peek();
            case 13:
                return this.aveCursor.peek();
            case 14:
                return this.veaCursor.peek();
            case 15:
                return this.vaeCursor.peek();
        }
    }
    proposeByte(bitset) {
        switch(this.state){
            case 0:
                throw new error("unreachable");
            case 1:
                this.eavCursor.propose(bitset);
                return;
            case 2:
                this.aevCursor.propose(bitset);
                return;
            case 3:
                this.veaCursor.propose(bitset);
                return;
            case 4:
                this.eavCursor.propose(bitset);
                return;
            case 5:
                this.evaCursor.propose(bitset);
                return;
            case 6:
                this.aevCursor.propose(bitset);
                return;
            case 7:
                this.aveCursor.propose(bitset);
                return;
            case 8:
                this.veaCursor.propose(bitset);
                return;
            case 9:
                this.vaeCursor.propose(bitset);
                return;
            case 10:
                this.eavCursor.propose(bitset);
                return;
            case 11:
                this.evaCursor.propose(bitset);
                return;
            case 12:
                this.aevCursor.propose(bitset);
                return;
            case 13:
                this.aveCursor.propose(bitset);
                return;
            case 14:
                this.veaCursor.propose(bitset);
                return;
            case 15:
                this.vaeCursor.propose(bitset);
                return;
        }
    }
    pushByte(__byte) {
        switch(this.state){
            case 0:
                throw new error("unreachable");
            case 1:
                this.eavCursor.push(__byte);
                this.evaCursor.push(__byte);
                return;
            case 2:
                this.aevCursor.push(__byte);
                this.aveCursor.push(__byte);
                return;
            case 3:
                this.veaCursor.push(__byte);
                this.vaeCursor.push(__byte);
                return;
            case 4:
                this.eavCursor.push(__byte);
                return;
            case 5:
                this.evaCursor.push(__byte);
                return;
            case 6:
                this.aevCursor.push(__byte);
                return;
            case 7:
                this.aveCursor.push(__byte);
                return;
            case 8:
                this.veaCursor.push(__byte);
                return;
            case 9:
                this.vaeCursor.push(__byte);
                return;
            case 10:
                this.eavCursor.push(__byte);
                return;
            case 11:
                this.evaCursor.push(__byte);
                return;
            case 12:
                this.aevCursor.push(__byte);
                return;
            case 13:
                this.aveCursor.push(__byte);
                return;
            case 14:
                this.veaCursor.push(__byte);
                return;
            case 15:
                this.vaeCursor.push(__byte);
                return;
        }
    }
    popByte() {
        switch(this.state){
            case 0:
                throw new error("unreachable");
            case 1:
                this.eavCursor.pop();
                this.evaCursor.pop();
                return;
            case 2:
                this.aevCursor.pop();
                this.aveCursor.pop();
                return;
            case 3:
                this.veaCursor.pop();
                this.vaeCursor.pop();
                return;
            case 4:
                this.eavCursor.pop();
                return;
            case 5:
                this.evaCursor.pop();
                return;
            case 6:
                this.aevCursor.pop();
                return;
            case 7:
                this.aveCursor.pop();
                return;
            case 8:
                this.veaCursor.pop();
                return;
            case 9:
                this.vaeCursor.pop();
                return;
            case 10:
                this.eavCursor.pop();
                return;
            case 11:
                this.evaCursor.pop();
                return;
            case 12:
                this.aevCursor.pop();
                return;
            case 13:
                this.aveCursor.pop();
                return;
            case 14:
                this.veaCursor.pop();
                return;
            case 15:
                this.vaeCursor.pop();
                return;
        }
    }
    variables(bitset) {
        bitset.unsetAll();
        bitset.set(this.eVar);
        bitset.set(this.aVar);
        bitset.set(this.vVar);
    }
    blocked(bitset) {
        bitset.unsetAll();
    }
    pushVariable(variable) {
        if (this.eVar === variable) {
            switch(this.state){
                case 0:
                    this.state = stack_e;
                    return;
                case 2:
                    this.state = stack_ae;
                    return;
                case 3:
                    this.state = stack_ve;
                    return;
                case 7:
                    this.state = stack_ave;
                    return;
                case 9:
                    this.state = stack_vae;
                    return;
                default:
                    throw new Error("unreachable");
            }
        }
        if (this.aVar === variable) {
            switch(this.state){
                case 0:
                    this.state = stack_a;
                    return;
                case 1:
                    this.state = stack_ea;
                    return;
                case 3:
                    this.state = stack_va;
                    return;
                case 5:
                    this.state = stack_eva;
                    return;
                case 8:
                    this.state = stack_vea;
                    return;
                default:
                    throw new Error("unreachable");
            }
        }
        if (this.vVar == variable) {
            switch(this.state){
                case 0:
                    this.state = stack_v;
                    return;
                case 1:
                    this.state = stack_ev;
                    return;
                case 2:
                    this.state = stack_av;
                    return;
                case 4:
                    this.state = stack_eav;
                    return;
                case 6:
                    this.state = stack_aev;
                    return;
                default:
                    throw new Error("unreachable");
                    return;
            }
        }
    }
    popVariable() {
        switch(this.state){
            case 0:
                throw new Error("unreachable");
            case 1:
            case 2:
            case 3:
                this.state = stack_empty;
                return;
            case 4:
            case 5:
                this.state = stack_e;
                return;
            case 6:
            case 7:
                this.state = stack_a;
                return;
            case 8:
            case 9:
                this.state = stack_v;
                return;
            case 10:
                this.state = stack_ea;
                return;
            case 11:
                this.state = stack_ev;
                return;
            case 12:
                this.state = stack_ae;
                return;
            case 13:
                this.state = stack_av;
                return;
            case 14:
                this.state = stack_ve;
                return;
            case 15:
                this.state = stack_va;
                return;
        }
    }
    variableCosts(variable) {
        if (this.eVar === variable) {
            switch(this.state){
                case 0:
                    return this.eavCursor.segmentCount();
                case 2:
                    return this.aevCursor.segmentCount();
                case 3:
                    return this.veaCursor.segmentCount();
                case 7:
                    return this.aveCursor.segmentCount();
                case 9:
                    return this.vaeCursor.segmentCount();
                default:
                    throw new Error("unreachable");
            }
        }
        if (this.aVar === variable) {
            switch(this.state){
                case 0:
                    return this.aevCursor.segmentCount();
                case 1:
                    return this.eavCursor.segmentCount();
                case 3:
                    return this.vaeCursor.segmentCount();
                case 5:
                    return this.evaCursor.segmentCount();
                case 8:
                    return this.veaCursor.segmentCount();
                default:
                    throw new Error("unreachable");
            }
        }
        if (this.vVar === variable) {
            switch(this.state){
                case 0:
                    return this.veaCursor.segmentCount();
                case 1:
                    return this.evaCursor.segmentCount();
                case 2:
                    return this.aveCursor.segmentCount();
                case 4:
                    return this.eavCursor.segmentCount();
                case 6:
                    return this.aevCursor.segmentCount();
                default:
                    throw new Error("unreachable");
            }
        }
    }
}
class TribleSet {
    constructor(EAV = emptyIdIdValueTriblePACT, EVA = emptyIdValueIdTriblePACT, AEV = emptyIdIdValueTriblePACT, AVE = emptyIdValueIdTriblePACT, VEA = emptyValueIdIdTriblePACT, VAE = emptyValueIdIdTriblePACT){
        this.EAV = EAV;
        this.EVA = EVA;
        this.AEV = AEV;
        this.AVE = AVE;
        this.VEA = VEA;
        this.VAE = VAE;
    }
    with(tribles) {
        const EAV = this.EAV.batch();
        const EVA = this.EVA.batch();
        const AEV = this.AEV.batch();
        const AVE = this.AVE.batch();
        const VEA = this.VEA.batch();
        const VAE = this.VAE.batch();
        for (const trible of tribles){
            EAV.put(scrambleEAV(trible));
            EVA.put(scrambleEVA(trible));
            AEV.put(scrambleAEV(trible));
            AVE.put(scrambleAVE(trible));
            VEA.put(scrambleVEA(trible));
            VAE.put(scrambleVAE(trible));
        }
        return new TribleSet(EAV.complete(), EVA.complete(), AEV.complete(), AVE.complete(), VEA.complete(), VAE.complete());
    }
    tribles() {
        return this.EAV.keys();
    }
    tripleConstraint([e, a, v1]) {
        return new TribleConstraint(this, e.index, a.index, v1.index);
    }
    patternConstraint(triples) {
        return and(...triples.map(([e, a, v1])=>new TribleConstraint(this, e.index, a.index, v1.index)));
    }
    count() {
        return this.EAV.count();
    }
    empty() {
        return new TribleSet();
    }
    isEmpty() {
        return this.EAV.isEmpty();
    }
    isEqual(other) {
        return this.EAV.isEqual(other.EAV);
    }
    isSubsetOf(other) {
        return this.EAV.isSubsetOf(other.indexE);
    }
    isIntersecting(other) {
        return this.EAV.isIntersecting(other.indexE);
    }
    union(other) {
        return new TribleSet(this.EAV.union(other.EAV), this.EVA.union(other.EVA), this.AEV.union(other.AEV), this.AVE.union(other.AVE), this.VEA.union(other.VEA), this.VAE.union(other.VAE));
    }
    subtract(other) {
        return new TribleSet(this.EAV.subtract(other.EAV), this.EVA.subtract(other.EVA), this.AEV.subtract(other.AEV), this.AVE.subtract(other.AVE), this.VEA.subtract(other.VEA), this.VAE.subtract(other.VAE));
    }
    difference(other) {
        return new TribleSet(this.EAV.difference(other.EAV), this.EVA.difference(other.EVA), this.AEV.difference(other.AEV), this.AVE.difference(other.AVE), this.VEA.difference(other.VEA), this.VAE.difference(other.VAE));
    }
    intersect(other) {
        return new TribleSet(this.EAV.intersect(other.EAV), this.EVA.intersect(other.EVA), this.AEV.intersect(other.AEV), this.AVE.intersect(other.AVE), this.VEA.intersect(other.VEA), this.VAE.intersect(other.VAE));
    }
}
function padded(length, alignment) {
    return length + (alignment - length % alignment);
}
function deserialize1(tribleset, blobcache, serialized_bytes) {
    if (serialized_bytes.length % 64 !== 0) {
        throw Error("serialized blob data must be multiple of 64byte");
    }
    let blobs = emptyValuePACT1.batch();
    let offset = 0;
    const dataview = new DataView(serialized_bytes.buffer);
    while(offset < serialized_bytes.length){
        const length_start_offset = offset + 24;
        const blob_length = dataview.getBigUint64(length_start_offset, false);
        const hash_start_offset = offset + 32;
        const hash_end_offset = offset + 64;
        const provided_hash = serialized_bytes.subarray(hash_start_offset, hash_end_offset);
        const blob_start_offset = 64 + offset;
        const blob_end_offset = 64 + offset + blob_length;
        if (serialized_bytes.length < blob_end_offset) {
            throw Error("bad length for blob");
        }
        const blob = serialized_bytes.subarray(blob_start_offset, blob_end_offset);
        const computed_hash = new Uint8Array(32);
        blake2b256(blob, computed_hash);
        if (!hash_equal(provided_hash, computed_hash)) {
            throw Error("bad hash for blob");
        }
        blobs = blobs.put(provided_hash, blob);
        offset += 64 + padded(blob_length, 64);
    }
    blobs.complete();
    let blobdata = blobcache;
    for (const { e , a , v: v1  } of find(({ e , a , v: v1  }, anon)=>and(tribleset.tripleConstraint(e, a, v1), blobs.segmentConstraint([
            v1
        ])), (variables, binding)=>{
        const { e , a , v: v1  } = variables.namedVars();
        return {
            e: binding.get(e.index),
            a: binding.get(a.index),
            v: binding.get(v1.index)
        };
    })){
        const trible = new Uint8Array(64);
        E(trible).set(LOWER(e));
        A(trible).set(LOWER(a));
        V(trible).set(v1);
        const blob1 = this.blobs.get(v1);
        blobdata = blobdata.put(trible, blob1);
    }
    return blobdata;
}
function serialize1(blobcache) {
    const timestamp = Date.now();
    const blobs = blobcache.strongBlobs();
    const buffer_length = blobs.length * 64 + blobs.reduce((acc, { blob  })=>acc + padded(blob.length, 64), 0);
    const serialized_bytes = new Uint8Array(buffer_length);
    const dataview = new DataView(serialized_bytes.buffer);
    let offset = 0;
    for (const { key , blob  } of blobs){
        dataview.setBigUint64(offset + 16, timestamp, false);
        dataview.setBigUint64(offset + 24, blob.length, false);
        serialized_bytes.subarray(offset + 32, offset + 64).set(key);
        offset += 64;
        serialized_bytes.subarray(offset, padded(blob.length, 64)).set(blob);
    }
    return bytes;
}
class BlobCache {
    constructor(onMiss = async ()=>{}, strong = emptyValueIdIdTriblePACT, weak = emptyValuePACT1){
        this.strong = strong;
        this.weak = weak;
        this.onMiss = onMiss;
    }
    with(blobs) {
        let weak = this.weak;
        let strong = this.strong;
        for (const [trible, blob] of blobs){
            const key = V(trible);
            const cached_blob = this.weak.get(key).deref();
            let new_or_cached_blob = blob;
            if (cached_blob === undefined) {
                weak = weak.put(key, new WeakRef(blob));
            } else {
                new_or_cached_blob = cached_blob;
            }
            strong = strong.put(scrambleVAE(trible), new_or_cached_blob);
        }
        return new BlobCache(this.onMiss, strong, weak);
    }
    async get(key) {
        let blob = this.weak.get(key).deref();
        if (blob === undefined) {
            blob = await this.onMiss(key);
            if (blob === undefined) {
                throw Error("No blob for key.");
            }
            this.weak = this.weak.put(key, new WeakRef(blob));
        }
        return blob;
    }
    strongConstraint(e, a, v1) {
        return this.strong.segmentConstraint([
            v1,
            a,
            e
        ]);
    }
    strongBlobs() {
        const blobs = [];
        for (const key of new find(({ v: v1  }, [e, a])=>masked(this.strong.segmentConstraint([
                v1,
                a,
                e
            ]), [
                e,
                a
            ]), (variables, binding)=>{
            const { v: v1  } = variables.namedVars();
            return binding.get(v1.index);
        })){
            const blob = this.weak.get(key);
            blobs.push({
                key,
                blob
            });
        }
    }
    empty() {
        return new BlobCache(this.onMiss, this.strong.empty(), this.weak);
    }
    clear() {
        return new BlobCache(this.onMiss, this.strong.empty(), this.weak.empty());
    }
    union(other) {
        return new BlobCache(this.onMiss, this.strong.union(other.strong), this.weak.union(other.weak));
    }
    subtract(other) {
        return new BlobCache(this.onMiss, this.strong.subtract(other.strong), this.weak.union(other.weak));
    }
    difference(other) {
        return new BlobCache(this.onMiss, this.strong.difference(other.strong), this.weak.union(other.weak));
    }
    intersect(other) {
        return new BlobCache(this.onMiss, this.strong.intersect(other.strong), this.weak.union(other.weak));
    }
}
class KB {
    constructor(tribleset = new TribleSet(), blobcache = new BlobCache()){
        this.tribleset = tribleset;
        this.blobcache = blobcache;
    }
    patternConstraint(pattern) {
        for (const [_e, _a, v1] of pattern){
            v1.proposeBlobCache(this.blobcache);
        }
        return this.tribleset.patternConstraint(pattern);
    }
    empty() {
        return new KB(this.tribleset.empty(), this.blobcache.empty());
    }
    isEmpty() {
        return this.tribleset.isEmpty();
    }
    isEqual(other) {
        return this.tribleset.isEqual(other.tribleset);
    }
    isSubsetOf(other) {
        return this.tribleset.isSubsetOf(other.tribleset);
    }
    isIntersecting(other) {
        return this.tribleset.isIntersecting(other.tribleset);
    }
    union(other) {
        const tribleset = this.tribleset.union(other.tribleset);
        const blobcache = this.blobcache.union(other.blobcache);
        return new KB(tribleset, blobcache);
    }
    subtract(other) {
        const tribleset = this.tribleset.subtract(other.tribleset);
        const blobcache = this.blobcache.subtract(other.blobcache);
        return new KB(tribleset, blobcache);
    }
    difference(other) {
        const tribleset = this.tribleset.difference(other.tribleset);
        const blobcache = this.blobcache.difference(other.blobcache);
        return new KB(tribleset, blobcache);
    }
    intersect(other) {
        const tribleset = this.tribleset.intersect(other.tribleset);
        const blobcache = this.blobcache.intersect(other.blobcache);
        return new KB(tribleset, blobcache);
    }
}
const assert = (test, message)=>{
    if (!test) {
        throw Error(message);
    }
};
const id = Symbol("id");
const isPojo = (obj)=>{
    if (obj === null || typeof obj !== "object") {
        return false;
    }
    return Object.getPrototypeOf(obj) === Object.prototype;
};
class IDSequence {
    constructor(factory){
        this.factory = factory;
    }
    [Symbol.iterator]() {
        return this;
    }
    next() {
        return {
            value: this.factory()
        };
    }
}
class NS {
    constructor(decl){
        const attributes = new Map();
        let forwardAttributeIndex = emptyValuePACT1;
        let inverseAttributeIndex = emptyValuePACT1;
        const newUniqueAttributeIndex = emptyValuePACT1.batch();
        const newUniqueInverseAttributeIndex = emptyValuePACT1.batch();
        const idDescription = decl[id];
        if (!idDescription) {
            throw Error(`Incomplete namespace: Missing [id] field.`);
        }
        if (!idDescription.decoder) {
            throw Error(`Incomplete namespace: Missing [id] decoder.`);
        }
        if (!idDescription.encoder) {
            throw Error(`Incomplete namespace: Missing [id] encoder.`);
        }
        if (!idDescription.factory) {
            throw Error(`Incomplete namespace: Missing [id] factory.`);
        }
        for (const [attributeName, attributeDescription] of Object.entries(decl)){
            if (attributeDescription.isInverse && !attributeDescription.isLink) {
                throw Error(`Bad options in namespace attribute ${attributeName}:
                Only links can be inversed.`);
            }
            if (!attributeDescription.isLink && !attributeDescription.decoder) {
                throw Error(`Missing decoder in namespace for attribute ${attributeName}.`);
            }
            if (!attributeDescription.isLink && !attributeDescription.encoder) {
                throw Error(`Missing encoder in namespace for attribute ${attributeName}.`);
            }
            const encodedId = new Uint8Array(32);
            idDescription.encoder(attributeDescription.id, encodedId);
            const description = {
                ...attributeDescription,
                encodedId,
                name: attributeName
            };
            attributes.set(attributeName, description);
            if (description.isInverse) {
                inverseAttributeIndex = inverseAttributeIndex.put(description.encodedId, [
                    ...inverseAttributeIndex.get(description.encodedId) || [],
                    description
                ]);
            } else {
                forwardAttributeIndex = forwardAttributeIndex.put(description.encodedId, [
                    ...forwardAttributeIndex.get(description.encodedId) || [],
                    description
                ]);
            }
        }
        for (const [_, attributeDescription1] of attributes){
            if (attributeDescription1.isLink) {
                attributeDescription1.encoder = idDescription.encoder;
                attributeDescription1.decoder = idDescription.decoder;
            }
        }
        for (const { encodedId: encodedId1 , isMany , isInverse  } of attributes.values()){
            if (!isMany) {
                if (isInverse) {
                    newUniqueInverseAttributeIndex.put(encodedId1);
                } else {
                    newUniqueAttributeIndex.put(encodedId1);
                }
            }
        }
        this.ids = idDescription;
        this.attributes = attributes;
        this.forwardAttributeIndex = forwardAttributeIndex;
        this.inverseAttributeIndex = inverseAttributeIndex;
        this.uniqueAttributeIndex = newUniqueAttributeIndex.complete();
        this.uniqueInverseAttributeIndex = newUniqueInverseAttributeIndex.complete();
    }
    validator(middleware = (commit)=>[
            commit
        ]) {
        const self = this;
        return function*(commit) {
            const unique = find1(({ v1 , v2  }, [e, a])=>and(indexed(a, self.uniqueAttributeIndex), commit.commitKB.tribleset.patternConstraint([
                    [
                        e,
                        a,
                        v1
                    ]
                ]), commit.currentKB.tribleset.patternConstraint([
                    [
                        e,
                        a,
                        v2
                    ]
                ])), (variables, binding)=>{
                const { v1 , v2  } = variables.namedVars();
                return [
                    binding.get(v1.index),
                    binding.get(v2.index)
                ];
            });
            for (const [v1, v2] of unique){
                if (!equalValue(v1, v2)) {
                    throw Error(`constraint violation: multiple values for unique attribute`);
                }
            }
            const inverseUnique = find1(({ e1 , e2  }, [a, v1])=>and(indexed(a, self.inverseAttributeIndex), commit.commitKB.tribleset.patternConstraint([
                    [
                        e1,
                        a,
                        v1
                    ]
                ]), commit.currentKB.tribleset.patternConstraint([
                    [
                        e2,
                        a,
                        v1
                    ]
                ])), (variables, binding)=>{
                const { e1 , e2  } = variables.namedVars();
                return [
                    binding.get(e1.index),
                    binding.get(e2.index)
                ];
            });
            for (const [e1, e2] of inverseUnique){
                if (!equalValue(e1, e2)) {
                    throw Error(`constraint violation: multiple entities for unique attribute value`);
                }
            }
            yield* middleware(commit);
        };
    }
    lookup(kb, eEncodedId, attributeName) {
        let { encodedId: aEncodedId , decoder , isLink , isInverse , isMany  } = this.attributes.get(attributeName);
        const res = find1(({ v: v1  }, [e, a])=>and(constant(e, eEncodedId), constant(a, aEncodedId), kb.tribleset.patternConstraint([
                isInverse ? [
                    v1,
                    a,
                    e
                ] : [
                    e,
                    a,
                    v1
                ]
            ])), (variables, binding)=>{
            const { v: v1  } = variables.namedVars();
            return binding.get(v1.index);
        });
        if (!isMany) {
            const { done , value  } = res[Symbol.iterator]().next();
            if (done) return {
                found: false
            };
            return {
                found: true,
                result: isLink ? this.entityProxy(kb, decoder(value.slice())) : decoder(value.slice(), async ()=>await kb.blobcache.get(value))
            };
        } else {
            const results = [];
            for (const value1 of res){
                results.push(isLink ? this.entityProxy(kb, decoder(value1.slice())) : decoder(value1.slice(), async ()=>await kb.blobcache.get(value1)));
            }
            return {
                found: true,
                result: results
            };
        }
    }
    entityProxy(kb, eId) {
        const eEncodedId = new Uint8Array(32);
        this.ids.encoder(eId, eEncodedId);
        const ns = this;
        return new Proxy({
            [id]: eId
        }, {
            get: function(o, attributeName) {
                if (!ns.attributes.has(attributeName)) {
                    return undefined;
                }
                if (attributeName in o) {
                    return o[attributeName];
                }
                const { found , result  } = ns.lookup(kb, eEncodedId, attributeName);
                if (found) {
                    Object.defineProperty(o, attributeName, {
                        value: result,
                        writable: false,
                        configurable: false,
                        enumerable: true
                    });
                    return result;
                }
                return undefined;
            },
            set: function(_, _attributeName) {
                throw TypeError("Error: Entities are not writable, please use 'with' on the walked KB.");
            },
            has: function(o, attributeName) {
                if (!ns.attributes.has(attributeName)) {
                    return false;
                }
                const { encodedId: aEncodedId , isInverse , isMany  } = ns.attributes.get(attributeName);
                if (attributeName in o || isMany) {
                    return true;
                }
                const res = find1(({}, [e, a, v1])=>and(constant(e, eEncodedId), constant(a, aEncodedId), kb.tribleset.patternConstraint([
                        isInverse ? [
                            v1,
                            a,
                            e
                        ] : [
                            e,
                            a,
                            v1
                        ]
                    ])), (variables, binding)=>{});
                const { done  } = res[Symbol.iterator]().next();
                return !done;
            },
            deleteProperty: function(_, attr) {
                throw TypeError("Error: Entities are not writable, furthermore KBs are append only.");
            },
            setPrototypeOf: function(_) {
                throw TypeError("Error: Entities are not writable and can only be POJOs.");
            },
            isExtensible: function(_) {
                return true;
            },
            preventExtensions: function(_) {
                return false;
            },
            defineProperty: function(_, attr) {
                throw TypeError("Error: Entities are not writable, please use 'with' on the walked KB.");
            },
            getOwnPropertyDescriptor: function(o, attributeName) {
                if (!ns.attributes.has(attributeName)) {
                    return undefined;
                }
                if (attributeName in o) {
                    return Object.getOwnPropertyDescriptor(o, attributeName);
                }
                const { found , result  } = ns.lookup(kb, eEncodedId, attributeName);
                if (found) {
                    const property = {
                        value: result,
                        writable: false,
                        configurable: false,
                        enumerable: true
                    };
                    Object.defineProperty(o, attributeName, property);
                    return property;
                }
                return undefined;
            },
            ownKeys: function(_) {
                const attrs = [
                    id
                ];
                const forward = find1(({ a  }, [e, v1])=>and(constant(e, eEncodedId), indexed(a, ns.forwardAttributeIndex), masked(kb.tribleset.patternConstraint([
                        [
                            e,
                            a,
                            v1
                        ]
                    ]), [
                        v1
                    ])), (variables, binding)=>{
                    const { a  } = variables.namedVars();
                    return binding.get(a.index);
                });
                debugger;
                for (const a of forward){
                    attrs.push(...ns.forwardAttributeIndex.get(a).map((attr)=>attr.name));
                }
                const inverse = find1(({ a  }, [e, v1])=>and(constant(v1, eEncodedId), indexed(a, ns.inverseAttributeIndex), masked(kb.tribleset.patternConstraint([
                        [
                            e,
                            a,
                            v1
                        ]
                    ]), [
                        e
                    ])), (variables, binding)=>{
                    const { a  } = variables.namedVars();
                    return binding.get(a.index);
                });
                for (const a1 of inverse){
                    attrs.push(...ns.inverseAttributeIndex.get(a1).map((attr)=>attr.name));
                }
                return attrs;
            }
        });
    }
    *entityToTriples(unknowns, parentId, parentAttributeName, entity) {
        const entityId = entity[id] || unknowns.next().value;
        if (parentId !== null) {
            yield [
                parentId,
                parentAttributeName,
                entityId
            ];
        }
        for (const [attributeName, value] of Object.entries(entity)){
            const attributeDescription = this.attributes.get(attributeName);
            assert(attributeDescription, `No attribute named '${attributeName}' in namespace.`);
            if (attributeDescription.isMany) {
                for (const v1 of value){
                    if (attributeDescription.isLink && isPojo(v1)) {
                        yield* this.entityToTriples(unknowns, entityId, attributeName, v1);
                    } else {
                        if (attributeDescription.isInverse) {
                            yield [
                                v1,
                                attributeName,
                                entityId
                            ];
                        } else {
                            yield [
                                entityId,
                                attributeName,
                                v1
                            ];
                        }
                    }
                }
            } else {
                if (attributeDescription.isLink && isPojo(value)) {
                    yield* this.entityToTriples(unknowns, entityId, attributeName, value);
                } else {
                    if (attributeDescription.isInverse) {
                        yield [
                            value,
                            attributeName,
                            entityId
                        ];
                    } else {
                        yield [
                            entityId,
                            attributeName,
                            value
                        ];
                    }
                }
            }
        }
    }
    *entitiesToTriples(unknowns, entities) {
        for (const entity of entities){
            yield* this.entityToTriples(unknowns, null, null, entity);
        }
    }
    triplesToTribles(triples) {
        const tribles = [];
        const blobs = [];
        const { encoder: idEncoder  } = this.ids;
        for (const [e, a, v1] of triples){
            const attributeDescription = this.attributes.get(a);
            const trible = new Uint8Array(64);
            const eb = new Uint8Array(32);
            idEncoder(e, eb);
            E(trible).set(eb.subarray(16, 32));
            A(trible).set(attributeDescription.encodedId.subarray(16, 32));
            const encodedValue = V(trible);
            let blob;
            const encoder = attributeDescription.encoder;
            try {
                blob = encoder(v1, encodedValue);
            } catch (err) {
                throw Error(`Couldn't encode '${v1}' as value for attribute '${a}':\n${err}`);
            }
            tribles.push(trible);
            if (blob) {
                blobs.push([
                    trible,
                    blob
                ]);
            }
        }
        return {
            tribles,
            blobs
        };
    }
    triplesToPattern(vars, triples) {
        const { encoder: idEncoder , decoder: idDecoder  } = this.ids;
        const pattern = [];
        const constraints = [];
        for (const [e, a, v1] of triples){
            const attributeDescription = this.attributes.get(a);
            let eVar;
            let aVar;
            let vVar;
            if (e instanceof Variable) {
                eVar = e.typed(this.ids);
            } else {
                const eb = new Uint8Array(32);
                idEncoder(e, eb);
                [eVar] = vars;
                constraints.push(constant(eVar, eb));
            }
            [aVar] = vars;
            constraints.push(constant(aVar, attributeDescription.encodedId));
            if (v1 instanceof Variable) {
                vVar = v1.typed(attributeDescription);
            } else {
                const encoder = attributeDescription.encoder;
                const b = new Uint8Array(32);
                try {
                    encoder(v1, b);
                } catch (error1) {
                    throw Error(`Error encoding value: ${error1.message}`);
                }
                [vVar] = vars;
                constraints.push(constant(vVar, b));
            }
            pattern.push([
                eVar,
                aVar,
                vVar
            ]);
        }
        return {
            pattern,
            constraints
        };
    }
    entities(entities, kb = new KB()) {
        const ids = new IDSequence(this.ids.factory);
        const createdEntities = entities(ids);
        const triples = this.entitiesToTriples(ids, createdEntities);
        const { tribles , blobs  } = this.triplesToTribles(triples);
        const newBlobCache = kb.blobcache.with(blobs);
        const newTribleSet = kb.tribleset.with(tribles);
        return new KB(newTribleSet, newBlobCache);
    }
    pattern(source, vars, entities) {
        const triples = this.entitiesToTriples(vars, entities);
        const { pattern , constraints  } = this.triplesToPattern(vars, triples);
        return and(...constraints, source.patternConstraint(pattern));
    }
    walk(kb, eId) {
        return this.entityProxy(kb, eId);
    }
}
const signatureId = UFOID.now();
const emailId = UFOID.now();
const firstNameId = UFOID.now();
const lastNameId = UFOID.now();
const authNS = {
    [id]: {
        ...types.ufoid
    },
    pubkey: {
        id: signatureId,
        ...types.blaked25519PubKey
    },
    authorEmail: {
        id: emailId,
        ...types.shortstring
    },
    authorFirstName: {
        id: firstNameId,
        ...types.shortstring
    },
    authorLastName: {
        id: lastNameId,
        ...types.shortstring
    }
};
function validateCommitSize(max_trible_count = 1021, middleware = (commit)=>[
        commit
    ]) {
    return async function*(commit) {
        for await (const commit1 of middleware(commit1)){
            if (commit1.commitKB.tribleset.count() > max_trible_count) {
                throw Error(`Commit too large: Commits must not contain more than ${max_trible_count} tribles.`);
            }
            yield commit1;
        }
    };
}
const commitGroupId = UFOID.now();
const commitSegmentId = UFOID.now();
const creationStampId = UFOID.now();
const shortMessageId = UFOID.now();
const messageId = UFOID.now();
const authoredById = UFOID.now();
const commitNS = {
    [id]: {
        ...types.ufoid
    },
    group: {
        id: commitGroupId,
        ...types.ufoid
    },
    segment: {
        id: commitSegmentId,
        ...types.subrange
    },
    createdAt: {
        id: creationStampId,
        ...types.geostamp
    },
    shortMessage: {
        id: shortMessageId,
        ...types.shortstring
    },
    message: {
        id: messageId,
        ...types.longstring
    },
    authoredBy: {
        id: authoredById,
        isLink: true
    }
};
({
    ...commitNS,
    ...authNS
});
class Commit {
    constructor(commitId, baseKB, commitKB, currentKB1){
        this.commitId = commitId;
        this.baseKB = baseKB;
        this.currentKB = currentKB1;
        this.commitKB = commitKB;
    }
    static deserialize(baseKB, tribleBytes, blobBytes) {
        const commitKB = baseKB.empty();
        const { metaId , pubkey , dataset  } = deserialize(commitKB.tribleset, tribleBytes);
        const blobdata = deserialize1(dataset, blobBytes);
        commitKB.tribleset = dataset;
        commitKB.blobcache = blobdata;
        const currentKB1 = baseKB.union(commitKB);
        return new Commit(baseKB, commitKB, currentKB1, metaId);
    }
    serialize(secret) {
        const tribles = serialize(this.commitKB.tribleset, this.commitId, secret);
        const blobs = serialize1(this.commitKB.blobcache);
        return {
            tribles,
            blobs
        };
    }
    patternConstraint(pattern) {
        for (const [_e, _a, v1] of pattern){
            v1.proposeBlobCache(this.blobcache);
        }
        return currentKB.tribleset.patternConstraint(pattern);
    }
}
class Head {
    constructor(initialKB, middleware = (commits)=>commits){
        this._current_kb = initialKB;
        this._middleware = middleware;
        this._subscriptions = new Set();
    }
    async commit(commitFn, commitId = UFOID.now()) {
        const baseKB = this._current_kb;
        const currentKB1 = commitFn(baseKB, commitId);
        const commitKB = currentKB1.subtract(baseKB);
        let commits = this._middleware(new Commit(commitId, baseKB, commitKB, currentKB1));
        for await (const commit of commits){
            this._current_kb = commit.currentKB;
            for (const sub of this._subscriptions){
                await sub(commit);
            }
        }
    }
    peek() {
        return this._current_kb;
    }
    sub(fn) {
        this._subscriptions.add(fn);
    }
    unsub(fn) {
        this._subscriptions.remove(fn);
    }
}
const MIN_KEY = new Uint8Array(32).fill(0);
const MAX_KEY = new Uint8Array(32).fill(~0);
class RangeConstraint {
    constructor(variable, lowerBound, upperBound){
        this.lowerBound = lowerBound;
        this.upperBound = upperBound;
        this.variable = variable;
        this.depth = 0;
        this.lowerFringe = 0;
        this.upperFringe = 0;
    }
    peekByte() {
        return null;
    }
    proposeByte(bitset) {
        const lowerByte = this.depth === this.lowerFringe ? this.lowerBound[this.depth] : 0;
        const upperByte = this.depth === this.upperFringe ? this.upperBound[this.depth] : 255;
        bitset.setRange(lowerByte, upperByte);
    }
    pushByte(__byte) {
        if (this.depth === this.lowerFringe && __byte === this.lowerBound[this.depth]) {
            this.lowerFringe++;
        }
        if (this.depth === this.upperFringe && __byte === this.upperBound[this.depth]) {
            this.upperFringe++;
        }
        this.depth++;
    }
    popByte() {
        this.depth--;
        if (this.depth < this.lowerFringe) {
            this.lowerFringe = this.depth;
        }
        if (this.depth < this.upperFringe) {
            this.upperFringe = this.depth;
        }
    }
    variables(bitset) {
        bitset.unsetAll();
        bitset.set(this.variable);
    }
    blocked(bitset) {
        bitset.unsetAll();
    }
    pushVariable(_variable) {}
    popVariable() {}
    variableCosts(_variable) {
        return Number.MAX_VALUE;
    }
}
function ranged(variable, type, { lower , upper  }) {
    variable.typed(type);
    let encodedLower = MIN_KEY;
    let encodedUpper = MAX_KEY;
    if (lower !== undefined) {
        encodedLower = new Uint8Array(VALUE_SIZE);
        type.encoder(lower, encodedLower);
    }
    if (upper !== undefined) {
        encodedUpper = new Uint8Array(VALUE_SIZE);
        type.encoder(upper, encodedUpper);
    }
    return new RangeConstraint(variable.index, encodedLower, encodedUpper);
}
class IDOwner {
    constructor(type){
        this.idType = type;
        this.ownedIDs = emptyIdPACT;
    }
    type() {
        return {
            ...this.idType,
            factory: this.factory()
        };
    }
    factory() {
        return ()=>{
            const b = new Uint8Array(32);
            const factory = this.idType.factory;
            const id = factory();
            this.idType.encoder(id, b);
            this.ownedIDs.put(b);
            return id;
        };
    }
    validator(middleware = (commit)=>[
            commit
        ]) {
        return function*(commit) {
            yield* middleware(commit);
        };
    }
}
export { and as and, BlobCache as BlobCache, collection as collection, constant as constant, find1 as find, Head as Head, id as id, IDOwner as IDOwner, indexed as indexed, KB as KB, masked as masked, NS as NS, ranged as ranged, TribleSet as TribleSet, types as types, UFOID as UFOID, validateCommitSize as validateCommitSize };
