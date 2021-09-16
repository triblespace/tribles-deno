import * as path from "https://deno.land/std/path/mod.ts";
const __dirname = path.dirname(new URL(import.meta.url).pathname);
console.log(import.meta.url);

let env = {
  inc(x) {
    return x + 1;
  },
};

console.log(__dirname);

const p = path.join(__dirname, "../../main.wasm");
const bytes = Deno.readFileSync(p);
const wasmModule = new WebAssembly.Module(bytes);
const wasmInstance = new WebAssembly.Instance(wasmModule, { env });
export const wasm = wasmInstance.exports;
