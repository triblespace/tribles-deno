build:
	zig build-lib src/zig/main.zig -target wasm32-freestanding -dynamic -OReleaseSafe

bench: build
	deno run --v8-flags=--max-heap-size=8192 --unstable --allow-env --allow-read ./bench

test: build
	deno test --unstable --allow-env --allow-read ./test/*
