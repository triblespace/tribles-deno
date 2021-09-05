build:
	rustwasmc build --no-wasi --target deno

bench: build
	deno run --v8-flags=--max-heap-size=8192 --unstable --allow-env --allow-read ./bench

test: build
	deno test --unstable --allow-env --allow-read ./test/*
