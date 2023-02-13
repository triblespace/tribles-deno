import { bench, runBenchmarks } from "https://deno.land/std/testing/bench.ts";
import { emptyTriblePACT as baseline, PACTHash } from "../src/js/pact.js";
import { A, E, TRIBLE_SIZE, V_LOWER, V_UPPER } from "../src/js/trible.js";
import { UFOID } from "../mod.js";

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

function putPrehashed(b, pactType, size) {
  const sample = generate_sample(size);

  for (const t of sample) {
    PACTHash(t);
  }

  let pact = pactType;
  b.start();
  for (const t of sample) {
    pact = pact.put(t);
  }
  b.stop();
}

benchAllPACT({
  name: "putPrecompHash",
  func: putPrehashed,
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
  for (const k of pact.keys()) {
    i++;
  }
  b.stop();
}

benchAllPACT({
  name: "Iterate",
  func: iterate,
});

runBenchmarks();
