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

export const _global_hash_input = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports.global_hash_input,
  64
);
export const _global_hash_output = new Uint8Array(
  instance.exports.memory.buffer,
  instance.exports.global_hash_output,
  16
);

export function hash(data) {
  _global_hash_input.set(data);
  instance.exports.run_hash(data.length);
  return new Uint8Array(_global_hash_output);
}
