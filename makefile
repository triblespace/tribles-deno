build: clean
	mkdir target
	cd src/rust/ ; cargo build --target-dir ../../target --target wasm32-unknown-unknown --release
	wasmwrap --input target/wasm32-unknown-unknown/release/tribles_deno.wasm --output src/js/wasmdata.js
	deno bundle mod.js bundle.js
	deno fmt

clean:
	rm -rf target

bench: build
	deno run --v8-flags=--max-heap-size=8192 --unstable --allow-env --allow-read --allow-hrtime ./bench

test: build
	deno test --unstable --allow-env --allow-read ./test/*
	
test-ff: build
	deno test --unstable --allow-env --allow-read --fail-fast ./test/*
