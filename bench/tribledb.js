import { bench, runBenchmarks } from "https://deno.land/std/testing/bench.ts";
import { MemTribleDB } from "../src/memtribledb.js";

function generate_sample(size) {
  const facts = [];
  const fact = new Uint8Array(64);
  const e = fact.subarray(0, 16);
  const a = fact.subarray(16, 32);
  const v1 = fact.subarray(32, 60);
  const v2 = fact.subarray(60, 64);
  crypto.getRandomValues(fact);
  for (let i = 0; i < size; i++) {
    if (0.1 >= Math.random()) {
      crypto.getRandomValues(e);
    }
    if (0.1 >= Math.random()) {
      crypto.getRandomValues(a);
    }
    if (0.8 >= Math.random()) {
      crypto.getRandomValues(v1);
    }
    if (0.8 >= Math.random()) {
      crypto.getRandomValues(v2);
    }
    facts.push(Uint8Array.from(fact));
  }
  return facts;
}

function dbWith(b, size) {
  const sample = generate_sample(size);
  let db = new MemTribleDB();
  b.start();
  db = db.with(sample);
  b.stop();
}

bench({
  name: "dbWith1e2",
  runs: 100,
  func(b) {
    dbWith(b, 1e2);
  },
});

bench({
  name: "dbWith1e3",
  runs: 100,
  func(b) {
    dbWith(b, 1e3);
  },
});

bench({
  name: "dbWith1e4",
  runs: 100,
  func(b) {
    dbWith(b, 1e4);
  },
});

bench({
  name: "dbWith1e5",
  runs: 10,
  func(b) {
    dbWith(b, 1e5);
  },
});

runBenchmarks();
