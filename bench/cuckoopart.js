import { bench, runBenchmarks } from "https://deno.land/std/testing/bench.ts";
import { emptyTriblePART } from "../src/cuckoopart.js";

function generate_sample(size, sharing_prob = 0.1) {
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
    if (i++ > chunkSize) {
      part = part.union(batch.complete());
      batch = emptyTriblePART.batch();
    }
  }
  part = part.union(batch.complete());
  b.stop();
}

bench({
  name: "putChunked1e1Batched1e4",
  runs: 1,
  func(b) {
    chunkedBatchedPut(b, 1e1, 1e4);
  },
});

bench({
  name: "putChunked1e2Batched1e4",
  runs: 1,
  func(b) {
    chunkedBatchedPut(b, 1e2, 1e4);
  },
});

bench({
  name: "putChunked1e3Batched1e4",
  runs: 1,
  func(b) {
    chunkedBatchedPut(b, 1e3, 1e4);
  },
});

bench({
  name: "putChunked1e4Batched1e4",
  runs: 1,
  func(b) {
    chunkedBatchedPut(b, 1e4, 1e4);
  },
});


function setUnion(b, size) {
  let partA = emptyTriblePART.batch();
  let partB = emptyTriblePART.batch();
  for (const t of generate_sample(size)) {
    partA.put(t);
  }
  partA = partA.complete();
  for (const t of generate_sample(size)) {
    partB.put(t);
  }
  partB = partB.complete();
  b.start();
  partA.union(partB);
  b.stop();
}

bench({
  name: "SetUnion1e2",
  runs: 100,
  func(b) {
    setUnion(b, 1e2);
  },
});

bench({
  name: "SetUnion1e3",
  runs: 100,
  func(b) {
    setUnion(b, 1e3);
  },
});

bench({
  name: "SetUnion1e4",
  runs: 10,
  func(b) {
    setUnion(b, 1e4);
  },
});

bench({
  name: "SetUnion1e5",
  runs: 1,
  func(b) {
    setUnion(b, 1e5);
  },
});



function setIntersect(b, size) {
  let partA = emptyTriblePART.batch();
  let partB;
  let partC;
  for (const t of generate_sample(size)) {
    partA.put(t);
  }
  partA = partA.complete();
  partB = partA.batch()
  for (const t of generate_sample(size)) {
    partB.put(t);
  }
  partB = partB.complete();
  partC = partA.batch()
  for (const t of generate_sample(size)) {
    partC.put(t);
  }
  partC = partC.complete();
  b.start();
  partB.intersect(partC);
  b.stop();
}

bench({
  name: "SetIntersect1e2",
  runs: 100,
  func(b) {
    setIntersect(b, 1e2);
  },
});

bench({
  name: "SetIntersect1e3",
  runs: 100,
  func(b) {
    setIntersect(b, 1e3);
  },
});

bench({
  name: "SetIntersect1e4",
  runs: 10,
  func(b) {
    setIntersect(b, 1e4);
  },
});

bench({
  name: "SetIntersect1e5",
  runs: 1,
  func(b) {
    setIntersect(b, 1e5);
  },
});

function setSubtract(b, size) {
  let partA = emptyTriblePART.batch();
  let partB;
  let partC;
  for (const t of generate_sample(size)) {
    partA.put(t);
  }
  partA = partA.complete();
  partB = partA.batch()
  for (const t of generate_sample(size)) {
    partB.put(t);
  }
  partB = partB.complete();
  partC = partA.batch()
  for (const t of generate_sample(size)) {
    partC.put(t);
  }
  partC = partC.complete();
  b.start();
  partB.subtract(partC);
  b.stop();
}

bench({
  name: "SetSubtract1e2",
  runs: 100,
  func(b) {
    setSubtract(b, 1e2);
  },
});

bench({
  name: "SetSubtract1e3",
  runs: 100,
  func(b) {
    setSubtract(b, 1e3);
  },
});

bench({
  name: "SetSubtract1e4",
  runs: 10,
  func(b) {
    setSubtract(b, 1e4);
  },
});

bench({
  name: "SetSubtract1e5",
  runs: 1,
  func(b) {
    setSubtract(b, 1e5);
  },
});

function setDifference(b, size) {
  let partA = emptyTriblePART.batch();
  let partB;
  let partC;
  for (const t of generate_sample(size)) {
    partA.put(t);
  }
  partA = partA.complete();
  partB = partA.batch()
  for (const t of generate_sample(size)) {
    partB.put(t);
  }
  partB = partB.complete();
  partC = partA.batch()
  for (const t of generate_sample(size)) {
    partC.put(t);
  }
  partC = partC.complete();
  b.start();
  partB.difference(partC);
  b.stop();
}

bench({
  name: "SetDifference1e2",
  runs: 100,
  func(b) {
    setDifference(b, 1e2);
  },
});

bench({
  name: "SetDifference1e3",
  runs: 100,
  func(b) {
    setDifference(b, 1e3);
  },
});

bench({
  name: "SetDifference1e4",
  runs: 10,
  func(b) {
    setDifference(b, 1e4);
  },
});

bench({
  name: "SetDifference1e5",
  runs: 1,
  func(b) {
    setDifference(b, 1e5);
  },
});

function setSubsetOf(b, size) {
  let partA = emptyTriblePART.batch();
  let partB;
  let partC;
  for (const t of generate_sample(size)) {
    partA.put(t);
  }
  partA = partA.complete();
  partB = partA.batch()
  for (const t of generate_sample(size)) {
    partB.put(t);
  }
  partB = partB.complete();
  partC = partA.batch()
  for (const t of generate_sample(size)) {
    partC.put(t);
  }
  partC = partC.complete();
  if (0.5 < Math.random()) {
    b.start();
    partB.isSubsetOf(partC);
    b.stop();
  } else {
    b.start();
    partA.isSubsetOf(partC);
    b.stop();
  }
}

bench({
  name: "SetSubsetOf1e2",
  runs: 100,
  func(b) {
    setSubsetOf(b, 1e2);
  },
});

bench({
  name: "SetSubsetOf1e3",
  runs: 100,
  func(b) {
    setSubsetOf(b, 1e3);
  },
});

bench({
  name: "SetSubsetOf1e4",
  runs: 10,
  func(b) {
    setSubsetOf(b, 1e4);
  },
});

bench({
  name: "SetSubsetOf1e5",
  runs: 1,
  func(b) {
    setSubsetOf(b, 1e5);
  },
});


function setIntersecting(b, size) {
  let partA = emptyTriblePART.batch();
  let partB = emptyTriblePART.batch();
  let partC = emptyTriblePART.batch();
  for (const t of generate_sample(size)) {
    partA.put(t);
  }
  for (const t of generate_sample(size)) {
    partA.put(t);
    partB.put(t);
  }
  for (const t of generate_sample(size)) {
    partB.put(t);
    partC.put(t);
  }
  partA = partA.complete();
  partB = partB.complete();
  partC = partC.complete();
  if (0.5 < Math.random()) {
    b.start();
    partB.isIntersecting(partC);
    b.stop();
  } else {
    b.start();
    partA.isIntersecting(partC);
    b.stop();
  }
}

bench({
  name: "SetIntersectingOf1e2",
  runs: 100,
  func(b) {
    setIntersecting(b, 1e2);
  },
});

bench({
  name: "SetIntersecting1e3",
  runs: 100,
  func(b) {
    setIntersecting(b, 1e3);
  },
});

bench({
  name: "SetIntersecting1e4",
  runs: 10,
  func(b) {
    setIntersecting(b, 1e4);
  },
});

bench({
  name: "SetIntersecting1e5",
  runs: 1,
  func(b) {
    setIntersecting(b, 1e5);
  },
});


runBenchmarks({only: /Intersecting/});
