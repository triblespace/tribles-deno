import { bench, runBenchmarks } from "https://deno.land/std/testing/bench.ts";
import { emptyTriblePART as vanilla } from "../src/part.js";
import { emptyTriblePART as cuckoo } from "../src/cuckoopart.js";
import { emptyTriblePART as int32 } from "../src/cuckoopartint32.js";

const variants = [
  {
    runs: 100,
    size: 1e2,
    name: "1e2",
  },
  {
    runs: 50,
    size: 1e3,
    name: "1e3",
  },
  {
    runs: 10,
    size: 1e4,
    name: "1e4",
  },
  {
    runs: 5,
    size: 1e5,
    name: "1e5",
  },
];

const benchAllPART = ({ name, func }) => {
  variants.forEach(({ runs, name: variantName, size }) => {
    bench({
      name: `vanilla@${variantName}:${name}`,
      runs,
      func(b) {
        func(b, vanilla, size);
      },
    });
    bench({
      name: `cuckoo@${variantName}:${name}`,
      runs,
      func(b) {
        func(b, cuckoo, size);
      },
    });
    bench({
      name: `int32@${variantName}:${name}`,
      runs,
      func(b) {
        func(b, int32, size);
      },
    });
  });
};

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
function persistentPut(b, partType, size) {
  const sample = generate_sample(size);
  let part = partType;
  b.start();
  for (const t of sample) {
    part = part.put(t);
  }
  b.stop();
}

benchAllPART({
  name: "put",
  func: persistentPut,
});

function batchedPut(b, partType, size) {
  const sample = generate_sample(size);
  const part = partType;
  b.start();
  const batch = part.batch();
  for (const t of sample) {
    batch.put(t);
  }
  batch.complete();
  b.stop();
}

benchAllPART({
  name: "putBatch",
  func: batchedPut,
});

function setUnion(b, partType, size) {
  let partA = partType.batch();
  let partB = partType.batch();
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

benchAllPART({
  name: "SetUnion",
  func: setUnion,
});

function setIntersect(b, partType, size) {
  let partA = partType.batch();
  let partB;
  let partC;
  for (const t of generate_sample(size)) {
    partA.put(t);
  }
  partA = partA.complete();
  partB = partA.batch();
  for (const t of generate_sample(size)) {
    partB.put(t);
  }
  partB = partB.complete();
  partC = partA.batch();
  for (const t of generate_sample(size)) {
    partC.put(t);
  }
  partC = partC.complete();
  b.start();
  partB.intersect(partC);
  b.stop();
}

benchAllPART({
  name: "SetIntersect",
  func: setIntersect,
});

function setSubtract(b, partType, size) {
  let partA = partType.batch();
  let partB;
  let partC;
  for (const t of generate_sample(size)) {
    partA.put(t);
  }
  partA = partA.complete();
  partB = partA.batch();
  for (const t of generate_sample(size)) {
    partB.put(t);
  }
  partB = partB.complete();
  partC = partA.batch();
  for (const t of generate_sample(size)) {
    partC.put(t);
  }
  partC = partC.complete();
  b.start();
  partB.subtract(partC);
  b.stop();
}

benchAllPART({
  name: "SetSubtract",
  func: setSubtract,
});

function setDifference(b, partType, size) {
  let partA = partType.batch();
  let partB;
  let partC;
  for (const t of generate_sample(size)) {
    partA.put(t);
  }
  partA = partA.complete();
  partB = partA.batch();
  for (const t of generate_sample(size)) {
    partB.put(t);
  }
  partB = partB.complete();
  partC = partA.batch();
  for (const t of generate_sample(size)) {
    partC.put(t);
  }
  partC = partC.complete();
  b.start();
  partB.difference(partC);
  b.stop();
}

benchAllPART({
  name: "SetDifference",
  func: setDifference,
});

function setSubsetOf(b, partType, size) {
  let partA = partType.batch();
  let partB;
  let partC;
  for (const t of generate_sample(size)) {
    partA.put(t);
  }
  partA = partA.complete();
  partB = partA.batch();
  for (const t of generate_sample(size)) {
    partB.put(t);
  }
  partB = partB.complete();
  partC = partA.batch();
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

benchAllPART({
  name: "SetSubsetOf",
  func: setSubsetOf,
});

function setIntersecting(b, partType, size) {
  let partA = partType.batch();
  let partB = partType.batch();
  let partC = partType.batch();
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

benchAllPART({
  name: "SetIntersecting",
  func: setIntersecting,
});

runBenchmarks();
