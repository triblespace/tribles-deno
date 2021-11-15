import * as path from "https://deno.land/std/path/mod.ts";
import Context from "https://deno.land/std@0.107.0/wasi/snapshot_preview1.ts";

let env = {
  inc(x) {
    return x + 1;
  },
};

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const p = path.join(__dirname, "../../main.wasm");

const context = new Context({
  args: Deno.args,
  env: Deno.env.toObject(),
});

const binary = await Deno.readFile(p);
const module = await WebAssembly.compile(binary);
export const instance = await WebAssembly.instantiate(module, {
  wasi_snapshot_preview1: context.exports,
});

context.initialize(instance);

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

export function alloc(size) {
  const ptr = instance.exports.alloc(size);
  return new Uint8Array(instance.exports.memory.buffer, ptr, size);
}

export function free(array) {
  const ptr = instance.exports.free(array.byteOffset, array.byteLength);
}
