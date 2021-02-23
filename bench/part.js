import { bench, runBenchmarks } from "https://deno.land/std/testing/bench.ts";
import { emptyTriblePART } from "../src/part.js";

function generate_sample(size, sharing_prob = 0.1) {
  const facts = [];
  const fact = new Uint8Array(64);
  const e = fact.subarray(0, 16);
  const a = fact.subarray(16, 32);
  const v1 = fact.subarray(32, 60);
  const v2 = fact.subarray(60, 64);
  crypto.getRandomValues(fact);
  for (let i = 0; i < size; i++) {
    if (sharing_prob < Math.random()) {
      crypto.getRandomValues(v1);
      if (sharing_prob < Math.random()) {
        crypto.getRandomValues(a);
        if (sharing_prob < Math.random()) {
          crypto.getRandomValues(e);
        }
      }
    }
    crypto.getRandomValues(v2);
    facts.push(Uint8Array.from(fact));
  }
  return facts;
}

bench({
  name: "put1e2",
  runs: 100,
  func(b) {
    const sample = generate_sample(1e2);
    let part = emptyTriblePART;
    b.start();
    for (const t of sample) {
      part = part.put(t);
    }
    b.stop();
  },
});

bench({
  name: "put1e3",
  runs: 100,
  func(b) {
    const sample = generate_sample(1e3);
    let part = emptyTriblePART;
    b.start();
    for (const t of sample) {
      part = part.put(t);
    }
    b.stop();
  },
});

bench({
  name: "put1e4",
  runs: 100,
  func(b) {
    const sample = generate_sample(1e4);
    let part = emptyTriblePART;
    b.start();
    for (const t of sample) {
      part = part.put(t);
    }
    b.stop();
  },
});

bench({
  name: "put1e5",
  runs: 10,
  func(b) {
    const sample = generate_sample(1e5);
    let part = emptyTriblePART;
    b.start();
    for (const t of sample) {
      part = part.put(t);
    }
    b.stop();
  },
});

bench({
  name: "putBatch1e2",
  runs: 100,
  func(b) {
    const sample = generate_sample(1e2);
    const part = emptyTriblePART;
    b.start();
    const batch = part.batch();
    for (const t of sample) {
      batch.put(t);
    }
    batch.complete();
    b.stop();
  },
});

bench({
  name: "putBatch1e3",
  runs: 100,
  func(b) {
    const sample = generate_sample(1e3);
    const part = emptyTriblePART;
    b.start();
    const batch = part.batch();
    for (const t of sample) {
      batch.put(t);
    }
    batch.complete();
    b.stop();
  },
});

bench({
  name: "putBatch1e4",
  runs: 100,
  func(b) {
    const sample = generate_sample(1e4);
    const part = emptyTriblePART;
    b.start();
    const batch = part.batch();
    for (const t of sample) {
      batch.put(t);
    }
    batch.complete();
    b.stop();
  },
});

bench({
  name: "putBatch1e5",
  runs: 10,
  func(b) {
    const sample = generate_sample(1e5);
    const part = emptyTriblePART;
    b.start();
    const batch = part.batch();
    for (const t of sample) {
      batch.put(t);
    }
    batch.complete();
    b.stop();
  },
});

runBenchmarks();
