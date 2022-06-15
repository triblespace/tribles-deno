import { buffer } from "../../build/wasmdata.js";

const module = await WebAssembly.compile(buffer);
export const instance = await WebAssembly.instantiate(module, {});

const _global_hash_this = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports.global_hash_this,
  16
);

const _global_hash_other = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports.global_hash_other,
  16
);

const _global_hash_data = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports.global_hash_data,
  64
);

export function hash_digest(data) {
  _global_hash_data.set(data);
  instance.exports.hash_digest(data.length);
  return new Uint8Array(_global_hash_this);
}

export function hash_combine(l, r) {
  _global_hash_this.set(l);
  _global_hash_other.set(r);
  instance.exports.hash_xor();
  return new Uint8Array(_global_hash_this);
}

export function hash_update(combined_hash, old_hash, new_hash) {
  _global_hash_this.set(combined_hash);
  _global_hash_other.set(old_hash);
  instance.exports.hash_xor();
  _global_hash_other.set(new_hash);
  instance.exports.hash_xor();
  return new Uint8Array(_global_hash_this);
}

export function hash_equal(l, r) {
  _global_hash_this.set(l);
  _global_hash_other.set(r);
  return instance.exports.hash_equal() === 1;
}
