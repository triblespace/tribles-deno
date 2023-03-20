import {
  bench,
  runBenchmarks,
} from "https://deno.land/std@0.180.0/testing/bench.ts";
import { TribleSet } from "../src/js/tribleset.js";
import { schema as ufoid, UFOID } from "../src/js/types/ufoid.js";

function generateRandomSample(size, sharing_prob = 0.1) {
  const facts = [];
  const fact = new Uint8Array(64);
  const e = fact.subarray(0, 16);
  const a = fact.subarray(16, 32);
  const v1 = fact.subarray(32, 48);
  const v2 = fact.subarray(48, 64);
  crypto.getRandomValues(fact);
  for (let i = 0; i < size; i++) {
    if (sharing_prob < Math.random()) {
      crypto.getRandomValues(e);
    }
    if (sharing_prob < Math.random()) {
      crypto.getRandomValues(a);
    }
    if (sharing_prob < Math.random()) {
      crypto.getRandomValues(v1);
    }
    if (sharing_prob < Math.random()) {
      crypto.getRandomValues(v2);
    }
    facts.push(Uint8Array.from(fact));
  }
  return facts;
}

function dbWithRandom(b, size) {
  const sample = generateRandomSample(size);
  let db = new TribleSet();
  b.start();
  db = db.with(sample);
  b.stop();
}

bench({
  name: "dbWithRandom1e2",
  runs: 100,
  func(b) {
    dbWithRandom(b, 1e2);
  },
});

bench({
  name: "dbWithRandom1e3",
  runs: 100,
  func(b) {
    dbWithRandom(b, 1e3);
  },
});

bench({
  name: "dbWithRandom1e4",
  runs: 100,
  func(b) {
    dbWithRandom(b, 1e4);
  },
});

bench({
  name: "dbWithRandom1e5",
  runs: 10,
  func(b) {
    dbWithRandom(b, 1e5);
  },
});

function generateUfoidSample(size) {
  const facts = [];
  const fact = new Uint8Array(64);
  const e = fact.subarray(0, 16);
  const a = fact.subarray(16, 32);
  const v = fact.subarray(48, 64);
  crypto.getRandomValues(fact);
  for (let i = 0; i < size; i++) {
    if (0.1 >= Math.random()) {
      e.set(UFOID.now().data);
    }
    if (0.1 >= Math.random()) {
      a.set(UFOID.now().data);
    }
    if (0.8 >= Math.random()) {
      v.set(UFOID.now().data);
    }
    facts.push(Uint8Array.from(fact));
  }
  return facts;
}

function dbWithUfoid(b, size) {
  const sample = generateUfoidSample(size);
  let db = new FOTribleSet();
  b.start();
  db = db.with(sample);
  b.stop();
}

bench({
  name: "dbWithUFOID1e2",
  runs: 100,
  func(b) {
    dbWithUfoid(b, 1e2);
  },
});

bench({
  name: "dbWithUFOID1e3",
  runs: 100,
  func(b) {
    dbWithUfoid(b, 1e3);
  },
});

bench({
  name: "dbWithUFOID1e4",
  runs: 100,
  func(b) {
    dbWithUfoid(b, 1e4);
  },
});

bench({
  name: "dbWithUFOID1e5",
  runs: 10,
  func(b) {
    dbWithUfoid(b, 1e5);
  },
});

runBenchmarks();
