build: clean
	mkdir build
	zig build-lib src/zig/main.zig -target wasm32-freestanding -dynamic -OReleaseFast -femit-bin=build/lib.wasm
	wasmwrap --input build/lib.wasm --output build/wasmdata.js
	deno bundle mod.js build/trible.js

clean:
	rm -rf build

bench: build
	deno run --v8-flags=--max-heap-size=8192 --unstable --allow-env --allow-read --allow-hrtime ./bench

test: build
	deno test --unstable --allow-env --allow-read ./test/*
	
test-ff: build
	deno test --unstable --allow-env --allow-read --fail-fast ./test/*
