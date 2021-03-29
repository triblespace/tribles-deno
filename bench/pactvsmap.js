import { bench, runBenchmarks } from "https://deno.land/std/testing/bench.ts";
import { emptyValuePACT } from "../src/pact.js";

function generate_sample(size, sharing_prob = 0.1) {
  const values = [];
  const value = new Uint8Array(32);
  const v1 = value.subarray(0, 16);
  const v2 = value.subarray(16, 32);
  crypto.getRandomValues(values);
  for (let i = 0; i < size; i++) {
    crypto.getRandomValues(v1);
    crypto.getRandomValues(v2);
    values.push(Uint8Array.from(value));
  }
  return values;
}

function persistentPut(b, size) {
  const sample = generate_sample(size);
  let pact = emptyValuePACT;
  b.start();
  for (const blob of sample) {
    pact = pact.put(blob, { blob: blob });
  }
  b.stop();
}

bench({
  name: "put1e2",
  runs: 100,
  func(b) {
    persistentPut(b, 1e2);
  },
});

bench({
  name: "put1e3",
  runs: 100,
  func(b) {
    persistentPut(b, 1e3);
  },
});

bench({
  name: "put1e4",
  runs: 100,
  func(b) {
    persistentPut(b, 1e4);
  },
});

bench({
  name: "put1e5",
  runs: 10,
  func(b) {
    persistentPut(b, 1e5);
  },
});

function batchedPut(b, size) {
  const sample = generate_sample(size);
  const pact = emptyValuePACT;
  b.start();
  const batch = pact.batch();
  for (const blob of sample) {
    batch.put(blob, { blob: blob });
  }
  batch.complete();
  b.stop();
}

bench({
  name: "putBatch1e2",
  runs: 100,
  func(b) {
    batchedPut(b, 1e2);
  },
});

bench({
  name: "putBatch1e3",
  runs: 100,
  func(b) {
    batchedPut(b, 1e3);
  },
});

bench({
  name: "putBatch1e4",
  runs: 100,
  func(b) {
    batchedPut(b, 1e4);
  },
});

bench({
  name: "putBatch1e5",
  runs: 10,
  func(b) {
    batchedPut(b, 1e5);
  },
});

function mapPut(b, sampleSize) {
  const sample = generate_sample(sampleSize);
  const m = new Map();
  b.start();
  for (const blob of sample) {
    const blobName = [...new Uint8Array(blob)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    m.set(blobName, { blob: blob });
  }
  b.stop();
}

bench({
  name: "mapPut1e2",
  runs: 100,
  func(b) {
    mapPut(b, 1e2);
  },
});

bench({
  name: "mapPut1e3",
  runs: 100,
  func(b) {
    mapPut(b, 1e3);
  },
});

bench({
  name: "mapPut1e4",
  runs: 100,
  func(b) {
    mapPut(b, 1e4);
  },
});

bench({
  name: "mapPut1e5",
  runs: 100,
  func(b) {
    mapPut(b, 1e5);
  },
});

/*
function iterateSet(b, pactType, size) {
  const set = new Set(generate_sample(size).map(t => t.map((b) => b.toString(16).padStart(2, "0")).join("")));
  b.start();
  let i = 0;
  for(const e of set){
    i++;
  }
  b.stop();
}

benchAllPACT({
  name: "IterateSet",
  func: iterateSet,
});

function iterateSetWithTransform(b, pactType, size) {
  const sample = generate_sample(size);
  b.start();
  const set = new Set(sample.map(t => t.map((b) => b.toString(16).padStart(2, "0")).join("")));
  let i = 0;
  for(const e of set){
    i++;
  }
  b.stop();
}

benchAllPACT({
  name: "IterateSetWithTransform",
  func: iterateSetWithTransform,
});
*/

runBenchmarks();
