import { buffer } from "../../build/wasmdata.js";

const module = await WebAssembly.compile(buffer);
export const instance = await WebAssembly.instantiate(module, {});

// # siphash
const _global_hash_secret = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports.global_hash_secret,
  16
);

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

crypto.getRandomValues(_global_hash_secret);

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

// # Blake2b256
const blake2b256_digest_size = 32;
const blake_buffer_size = 1024;

const _global_blake2b256_out = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports.global_blake2b256_out,
  blake2b256_digest_size
);
const _global_blake2b256_buffer = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports.global_blake2b256_buffer,
  blake_buffer_size
);

export function blake2b256(data, out) {
  let i = 0;
  for(; (i + blake_buffer_size) < data.length; i+= blake_buffer_size) {
    _global_blake2b256_buffer.set(data.subarray(i, i + blake_buffer_size), i);

    instance.exports.blake2b256_update(blake_buffer_size);
  }

  _global_blake2b256_buffer.set(data.subarray(i, data.length), i);
  instance.exports.blake2b256_update(data.length - i);

  instance.exports.blake2b256_finish();
  out.set(_global_blake2b256_out);
}

// # Commits
const commit_header_size = 128;
const commit_max_trible_count = 1020;
const trible_size = 64;
const commit_max_size = commit_header_size + (commit_max_trible_count * trible_size);
const commit_secret_size = 32;

const _global_commit_secret = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports._global_commit_secret,
  commit_secret_size
);
const _global_commit_buffer = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports._global_commit_buffer,
  commit_max_size
);

const _global_commit_buffer_pubkey = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports._global_commit_buffer + 16,
  32
);

const _global_commit_buffer_signature = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports._global_commit_buffer + 48,
  64
);

const _global_commit_buffer_commitid = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports._global_commit_buffer + 112,
  16
);

const _global_commit_buffer_tribles = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports._global_commit_buffer + 128,
  commit_max_trible_count * trible_size
);

export function commit_verify(data) {
  _global_commit_buffer.set(data);
  return instance.exports.commit_verify(data.length);
}

export function commit_sign(secret, trible_count) {
  _global_commit_secret.set(secret);
  if(!instance.exports.commit_sign(trible_count)) throw "Failed to sign commit!";
  return _global_commit_buffer.subarray(0, _global_commit_buffer_tribles + trible_count * trible_size);
}