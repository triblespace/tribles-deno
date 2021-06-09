import { bench, runBenchmarks } from "https://deno.land/std/testing/bench.ts";
import { emptyTriblePACT as baseline, nextKey, PACTHash } from "../src/pact.js";
import { A, E, TRIBLE_SIZE, V1, V2 } from "../src/trible.js";

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

const benchAllPACT = ({ name, func }) => {
  variants.forEach(({ runs, name: variantName, size }) => {
    bench({
      name: `baseline@${variantName}:${name}`,
      runs,
      func(b) {
        func(b, baseline, size);
      },
    });
  });
};

function generate_sample(size, sharing_prob = 0.1) {
  const tribles = [];
  const trible = new Uint8Array(TRIBLE_SIZE);
  const e = E(trible);
  const a = A(trible);
  const v1 = V1(trible);
  const v2 = V2(trible);
  crypto.getRandomValues(trible);
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
    tribles.push(Uint8Array.from(trible));
  }
  return tribles;
}
function persistentPut(b, pactType, size) {
  const sample = generate_sample(size);
  let pact = pactType;
  b.start();
  for (const t of sample) {
    pact = pact.put(t);
  }
  b.stop();
}

benchAllPACT({
  name: "put",
  func: persistentPut,
});

function batchedPut(b, pactType, size) {
  const sample = generate_sample(size);
  const pact = pactType;
  b.start();
  const batch = pact.batch();
  for (const t of sample) {
    batch.put(t);
  }
  batch.complete();
  b.stop();
}

benchAllPACT({
  name: "putBatch",
  func: batchedPut,
});

function batchedPutPrehashed(b, pactType, size) {
  const sample = generate_sample(size);

  for (const t of sample) {
    PACTHash(t);
  }

  const pact = pactType;
  b.start();
  const batch = pact.batch();
  for (const t of sample) {
    batch.put(t);
  }
  batch.complete();
  b.stop();
}

benchAllPACT({
  name: "putBatchPrecompHash",
  func: batchedPutPrehashed,
});

function setUnion(b, pactType, size) {
  let pactA = pactType.batch();
  let pactB = pactType.batch();
  for (const t of generate_sample(size)) {
    pactA.put(t);
  }
  pactA = pactA.complete();
  for (const t of generate_sample(size)) {
    pactB.put(t);
  }
  pactB = pactB.complete();
  b.start();
  pactA.union(pactB);
  b.stop();
}

benchAllPACT({
  name: "SetUnion",
  func: setUnion,
});

function setIntersect(b, pactType, size) {
  let pactA = pactType.batch();
  let pactB;
  let pactC;
  for (const t of generate_sample(size)) {
    pactA.put(t);
  }
  pactA = pactA.complete();
  pactB = pactA.batch();
  for (const t of generate_sample(size)) {
    pactB.put(t);
  }
  pactB = pactB.complete();
  pactC = pactA.batch();
  for (const t of generate_sample(size)) {
    pactC.put(t);
  }
  pactC = pactC.complete();
  b.start();
  pactB.intersect(pactC);
  b.stop();
}

benchAllPACT({
  name: "SetIntersect",
  func: setIntersect,
});

function setSubtract(b, pactType, size) {
  let pactA = pactType.batch();
  let pactB;
  let pactC;
  for (const t of generate_sample(size)) {
    pactA.put(t);
  }
  pactA = pactA.complete();
  pactB = pactA.batch();
  for (const t of generate_sample(size)) {
    pactB.put(t);
  }
  pactB = pactB.complete();
  pactC = pactA.batch();
  for (const t of generate_sample(size)) {
    pactC.put(t);
  }
  pactC = pactC.complete();
  b.start();
  pactB.subtract(pactC);
  b.stop();
}

benchAllPACT({
  name: "SetSubtract",
  func: setSubtract,
});

function setDifference(b, pactType, size) {
  let pactA = pactType.batch();
  let pactB;
  let pactC;
  for (const t of generate_sample(size)) {
    pactA.put(t);
  }
  pactA = pactA.complete();
  pactB = pactA.batch();
  for (const t of generate_sample(size)) {
    pactB.put(t);
  }
  pactB = pactB.complete();
  pactC = pactA.batch();
  for (const t of generate_sample(size)) {
    pactC.put(t);
  }
  pactC = pactC.complete();
  b.start();
  pactB.difference(pactC);
  b.stop();
}

benchAllPACT({
  name: "SetDifference",
  func: setDifference,
});

function setSubsetOf(b, pactType, size) {
  let pactA = pactType.batch();
  let pactB;
  let pactC;
  for (const t of generate_sample(size)) {
    pactA.put(t);
  }
  pactA = pactA.complete();
  pactB = pactA.batch();
  for (const t of generate_sample(size)) {
    pactB.put(t);
  }
  pactB = pactB.complete();
  pactC = pactA.batch();
  for (const t of generate_sample(size)) {
    pactC.put(t);
  }
  pactC = pactC.complete();
  if (0.5 < Math.random()) {
    b.start();
    pactB.isSubsetOf(pactC);
    b.stop();
  } else {
    b.start();
    pactA.isSubsetOf(pactC);
    b.stop();
  }
}

benchAllPACT({
  name: "SetSubsetOf",
  func: setSubsetOf,
});

function setIntersecting(b, pactType, size) {
  let pactA = pactType.batch();
  let pactB = pactType.batch();
  let pactC = pactType.batch();
  for (const t of generate_sample(size)) {
    pactA.put(t);
  }
  for (const t of generate_sample(size)) {
    pactA.put(t);
    pactB.put(t);
  }
  for (const t of generate_sample(size)) {
    pactB.put(t);
    pactC.put(t);
  }
  pactA = pactA.complete();
  pactB = pactB.complete();
  pactC = pactC.complete();
  if (0.5 < Math.random()) {
    b.start();
    pactB.isIntersecting(pactC);
    b.stop();
  } else {
    b.start();
    pactA.isIntersecting(pactC);
    b.stop();
  }
}

benchAllPACT({
  name: "SetIntersecting",
  func: setIntersecting,
});

function iterate(b, pactType, size) {
  let pact = pactType.batch();
  for (const t of generate_sample(size)) {
    pact.put(t);
  }
  pact = pact.complete();
  b.start();
  let i = 0;
  const cursor = pact.cursor();
  const key = new Uint8Array(TRIBLE_SIZE);
  while (true) {
    cursor.seek(key);
    if (!cursor.peek(key)) break;
    i++;
    if (!nextKey(key)) break;
  }
  b.stop();
}

benchAllPACT({
  name: "Iterate",
  func: iterate,
});

runBenchmarks();
