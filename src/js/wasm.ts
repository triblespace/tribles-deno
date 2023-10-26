import { FixedUint8Array } from "./util.ts";
import { buffer } from "./wasmdata.js";

const module = await WebAssembly.compile(buffer);
export const instance = await WebAssembly.instantiate(module, {});
const memory = instance.exports.memory as WebAssembly.Memory;

// # siphash
const _global_hash_secret = new Uint8Array(
  memory.buffer as ArrayBufferLike,
  (instance.exports.global_hash_secret as WebAssembly.Global).value,
  16,
);

const _global_hash_this = new Uint8Array(
  memory.buffer,
  (instance.exports.global_hash_this as WebAssembly.Global).value,
  16,
);

const _global_hash_other = new Uint8Array(
  memory.buffer,
  (instance.exports.global_hash_other as WebAssembly.Global).value,
  16,
);

const _global_hash_data = new Uint8Array(
  memory.buffer,
  (instance.exports.global_hash_data as WebAssembly.Global).value,
  64,
);

crypto.getRandomValues(_global_hash_secret);

export function hash_digest(data: Uint8Array): FixedUint8Array<16> {
  _global_hash_data.set(data);
  (instance.exports.hash_digest as (len: number) => void)(data.length);
  return new Uint8Array(_global_hash_this) as FixedUint8Array<16>;
}

export function hash_combine(
  l: FixedUint8Array<16>,
  r: FixedUint8Array<16>,
): FixedUint8Array<16> {
  _global_hash_this.set(l);
  _global_hash_other.set(r);
  (instance.exports.hash_xor as () => void)();
  return new Uint8Array(_global_hash_this) as FixedUint8Array<16>;
}

export function hash_update(
  combined_hash: FixedUint8Array<16>,
  old_hash: FixedUint8Array<16>,
  new_hash: FixedUint8Array<16>,
) {
  _global_hash_this.set(combined_hash);
  _global_hash_other.set(old_hash);
  (instance.exports.hash_xor as () => void)();
  _global_hash_other.set(new_hash);
  (instance.exports.hash_xor as () => void)();
  return new Uint8Array(_global_hash_this) as FixedUint8Array<16>;
}

export function hash_equal(
  l: FixedUint8Array<16>,
  r: FixedUint8Array<16>,
): boolean {
  _global_hash_this.set(l);
  _global_hash_other.set(r);
  return (instance.exports.hash_equal as () => number)() === 1;
}

// # Blake3
const blake3_digest_size = 32;
const blake_buffer_size = 16384;

const _global_blake3_out = new Uint8Array(
  memory.buffer,
  (instance.exports.global_blake3_out as WebAssembly.Global).value,
  blake3_digest_size,
);
const _global_blake3_buffer = new Uint8Array(
  memory.buffer,
  (instance.exports.global_blake3_buffer as WebAssembly.Global).value,
  blake_buffer_size,
);

export function blake3(data: Uint8Array) {
  (instance.exports.blake3_init as () => void)();
  let i = 0;
  for (; (i + blake_buffer_size) < data.length; i += blake_buffer_size) {
    _global_blake3_buffer.set(data.subarray(i, i + blake_buffer_size), i);

    (instance.exports.blake3_update as (size: number) => void)(
      blake_buffer_size,
    );
  }

  _global_blake3_buffer.set(data.subarray(i, data.length), i);
  (instance.exports.blake3_update as (size: number) => void)(data.length - i);

  (instance.exports.blake3_finish as () => void)();
  const out = new Uint8Array(32);
  out.set(_global_blake3_out);
  (instance.exports.blake3_deinit as () => void)();

  return out;
}
