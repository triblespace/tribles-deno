build: clean
	mkdir build
	zig build-lib --cache-dir build/zig-cache -target wasm32-freestanding -dynamic -OReleaseFast -femit-bin=build/lib.wasm src/zig/main.zig
	wasmwrap --input build/lib.wasm --output src/js/wasmdata.js
	deno bundle mod.js build/trible.js

clean:
	rm -rf build

bench: build
	deno run --v8-flags=--max-heap-size=8192 --unstable --allow-env --allow-read --allow-hrtime ./bench

test: build
	deno test --unstable --allow-env --allow-read ./test/*
	
test-ff: build
	deno test --unstable --allow-env --allow-read --fail-fast ./test/*
