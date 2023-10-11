import {
  bench,
  runBenchmarks,
} from "https://deno.land/std@0.180.0/testing/bench.ts";
import { emptyTriblePATCH as baseline, PATCHHash } from "../src/js/patch.ts";
import { A, E, TRIBLE_SIZE, V_LOWER, V_UPPER } from "../src/js/trible.ts";
import { UFOID } from "../mod.ts";

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

const benchAllPATCH = ({ name, func }) => {
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

function persistentPut(b, patchType, size) {
  const sample = generate_sample(size);
  let patch = patchType;
  b.start();
  for (const t of sample) {
    patch = patch.put(t);
  }
  b.stop();
}

benchAllPATCH({
  name: "put",
  func: persistentPut,
});

function putPrehashed(b, patchType, size) {
  const sample = generate_sample(size);

  for (const t of sample) {
    PATCHHash(t);
  }

  let patch = patchType;
  b.start();
  for (const t of sample) {
    patch = patch.put(t);
  }
  b.stop();
}

benchAllPATCH({
  name: "putPrecompHash",
  func: putPrehashed,
});

function batchedPut(b, patchType, size) {
  const sample = generate_sample(size);
  const patch = patchType;
  b.start();
  const batch = patch.batch();
  for (const t of sample) {
    batch.put(t);
  }
  batch.complete();
  b.stop();
}

benchAllPATCH({
  name: "putBatch",
  func: batchedPut,
});

function batchedPutPrehashed(b, patchType, size) {
  const sample = generate_sample(size);

  for (const t of sample) {
    PATCHHash(t);
  }

  const patch = patchType;
  b.start();
  const batch = patch.batch();
  for (const t of sample) {
    batch.put(t);
  }
  batch.complete();
  b.stop();
}

benchAllPATCH({
  name: "putBatchPrecompHash",
  func: batchedPutPrehashed,
});

function setUnion(b, patchType, size) {
  let patchA = patchType.batch();
  let patchB = patchType.batch();
  for (const t of generate_sample(size)) {
    patchA.put(t);
  }
  patchA = patchA.complete();
  for (const t of generate_sample(size)) {
    patchB.put(t);
  }
  patchB = patchB.complete();
  b.start();
  patchA.union(patchB);
  b.stop();
}

benchAllPATCH({
  name: "SetUnion",
  func: setUnion,
});

function setIntersect(b, patchType, size) {
  let patchA = patchType.batch();
  let patchB;
  let patchC;
  for (const t of generate_sample(size)) {
    patchA.put(t);
  }
  patchA = patchA.complete();
  patchB = patchA.batch();
  for (const t of generate_sample(size)) {
    patchB.put(t);
  }
  patchB = patchB.complete();
  patchC = patchA.batch();
  for (const t of generate_sample(size)) {
    patchC.put(t);
  }
  patchC = patchC.complete();
  b.start();
  patchB.intersect(patchC);
  b.stop();
}

benchAllPATCH({
  name: "SetIntersect",
  func: setIntersect,
});

function setSubtract(b, patchType, size) {
  let patchA = patchType.batch();
  let patchB;
  let patchC;
  for (const t of generate_sample(size)) {
    patchA.put(t);
  }
  patchA = patchA.complete();
  patchB = patchA.batch();
  for (const t of generate_sample(size)) {
    patchB.put(t);
  }
  patchB = patchB.complete();
  patchC = patchA.batch();
  for (const t of generate_sample(size)) {
    patchC.put(t);
  }
  patchC = patchC.complete();
  b.start();
  patchB.subtract(patchC);
  b.stop();
}

benchAllPATCH({
  name: "SetSubtract",
  func: setSubtract,
});

function setDifference(b, patchType, size) {
  let patchA = patchType.batch();
  let patchB;
  let patchC;
  for (const t of generate_sample(size)) {
    patchA.put(t);
  }
  patchA = patchA.complete();
  patchB = patchA.batch();
  for (const t of generate_sample(size)) {
    patchB.put(t);
  }
  patchB = patchB.complete();
  patchC = patchA.batch();
  for (const t of generate_sample(size)) {
    patchC.put(t);
  }
  patchC = patchC.complete();
  b.start();
  patchB.difference(patchC);
  b.stop();
}

benchAllPATCH({
  name: "SetDifference",
  func: setDifference,
});

function setSubsetOf(b, patchType, size) {
  let patchA = patchType.batch();
  let patchB;
  let patchC;
  for (const t of generate_sample(size)) {
    patchA.put(t);
  }
  patchA = patchA.complete();
  patchB = patchA.batch();
  for (const t of generate_sample(size)) {
    patchB.put(t);
  }
  patchB = patchB.complete();
  patchC = patchA.batch();
  for (const t of generate_sample(size)) {
    patchC.put(t);
  }
  patchC = patchC.complete();
  if (0.5 < Math.random()) {
    b.start();
    patchB.isSubsetOf(patchC);
    b.stop();
  } else {
    b.start();
    patchA.isSubsetOf(patchC);
    b.stop();
  }
}

benchAllPATCH({
  name: "SetSubsetOf",
  func: setSubsetOf,
});

function setIntersecting(b, patchType, size) {
  let patchA = patchType.batch();
  let patchB = patchType.batch();
  let patchC = patchType.batch();
  for (const t of generate_sample(size)) {
    patchA.put(t);
  }
  for (const t of generate_sample(size)) {
    patchA.put(t);
    patchB.put(t);
  }
  for (const t of generate_sample(size)) {
    patchB.put(t);
    patchC.put(t);
  }
  patchA = patchA.complete();
  patchB = patchB.complete();
  patchC = patchC.complete();
  if (0.5 < Math.random()) {
    b.start();
    patchB.isIntersecting(patchC);
    b.stop();
  } else {
    b.start();
    patchA.isIntersecting(patchC);
    b.stop();
  }
}

benchAllPATCH({
  name: "SetIntersecting",
  func: setIntersecting,
});

function iterate(b, patchType, size) {
  let patch = patchType.batch();
  for (const t of generate_sample(size)) {
    patch.put(t);
  }
  patch = patch.complete();
  b.start();
  let i = 0;
  for (const k of patch.keys()) {
    i++;
  }
  b.stop();
}

benchAllPATCH({
  name: "Iterate",
  func: iterate,
});

runBenchmarks();
