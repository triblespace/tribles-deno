import {
  bench,
  runBenchmarks,
} from "https://deno.land/std@0.180.0/testing/bench.ts";
import { emptyValuePATCH } from "../src/js/patch.js";
import { A, E, TRIBLE_SIZE, V_LOWER, V_UPPER } from "../src/js/trible.js";
import { UFOID } from "../mod.ts";

function generate_sample(size, sharing_prob = 0.1) {
  const tribles = [];
  const trible = new Uint8Array(TRIBLE_SIZE);
  for (let i = 0; i < size; i++) {
    if (sharing_prob < Math.random()) {
      E(trible).set(UFOID.now().subarray(16, 32));
    }
    if (sharing_prob < Math.random()) {
      A(trible).set(UFOID.now().subarray(16, 32));
    }
    if (sharing_prob < Math.random()) {
      V_UPPER(trible).set(UFOID.now().subarray(16, 32));
    }
    if (sharing_prob < Math.random()) {
      V_LOWER(trible).set(UFOID.now().subarray(16, 32));
    }
    tribles.push(Uint8Array.from(trible));
  }
  return tribles;
}

function persistentPut(b, size) {
  const sample = generate_sample(size);
  let patch = emptyValuePATCH;
  b.start();
  for (const blob of sample) {
    patch = patch.put(blob, { blob: blob });
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
  const patch = emptyValuePATCH;
  b.start();
  const batch = patch.batch();
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
function iterateSet(b, patchType, size) {
  const set = new Set(generate_sample(size).map(t => t.map((b) => b.toString(16).padStart(2, "0")).join("")));
  b.start();
  let i = 0;
  for(const e of set){
    i++;
  }
  b.stop();
}

benchAllPATCH({
  name: "IterateSet",
  func: iterateSet,
});

function iterateSetWithTransform(b, patchType, size) {
  const sample = generate_sample(size);
  b.start();
  const set = new Set(sample.map(t => t.map((b) => b.toString(16).padStart(2, "0")).join("")));
  let i = 0;
  for(const e of set){
    i++;
  }
  b.stop();
}

benchAllPATCH({
  name: "IterateSetWithTransform",
  func: iterateSetWithTransform,
});
*/

runBenchmarks();
