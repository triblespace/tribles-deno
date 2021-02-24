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
function persistentPut(b, size) {
    const sample = generate_sample(size);
    let part = emptyTriblePART;
    b.start();
    for (const t of sample) {
      part = part.put(t);
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
    const part = emptyTriblePART;
    b.start();
    const batch = part.batch();
    for (const t of sample) {
      batch.put(t);
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

function chunkedBatchedPut(b, chunkSize, sampleSize) {
    const sample = generate_sample(sampleSize);
    let part = emptyTriblePART;
    b.start();
    let batch = emptyTriblePART.batch();
    let i = 0;
    for (const t of sample) {
      batch.put(t);
      if(i++ > chunkSize) {
          part = part.union(batch.complete());
          batch = emptyTriblePART.batch();
      }
    }
    part = part.union(batch.complete())
    b.stop();
  }

  bench({
    name: "putChunked1e1Batched1e4",
    runs: 100,
    func(b) {
        chunkedBatchedPut(b, 1e1, 1e4)
    },
  });

  bench({
    name: "putChunked1e2Batched1e4",
    runs: 100,
    func(b) {
        chunkedBatchedPut(b, 1e2, 1e4)
    },
  });

  bench({
    name: "putChunked1e3Batched1e4",
    runs: 100,
    func(b) {
        chunkedBatchedPut(b, 1e3, 1e4)
    },
  });
  
  bench({
    name: "putChunked1e4Batched1e4",
    runs: 100,
    func(b) {
        chunkedBatchedPut(b, 1e4, 1e4)
    },
  });

runBenchmarks();
