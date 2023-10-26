import { Entry, batch, emptyEAVTriblePATCH } from "../src/js/patch.ts";
import { A, E, TRIBLE_SIZE, V } from "../src/js/trible.ts";
import { Trible, UFOID } from "../mod.ts";
import { fixedUint8Array } from "../src/js/util.ts";

function generate_sample(size: number, sharing_prob = 0.1): Trible[] {
  const tribles = [];
  const trible = fixedUint8Array(TRIBLE_SIZE);
  for (let i = 0; i < size; i++) {
    if (sharing_prob < Math.random()) {
      E(trible).set(UFOID.now().toId());
    }
    if (sharing_prob < Math.random()) {
      A(trible).set(UFOID.now().toId());
    }
    if (sharing_prob < Math.random()) {
      V(trible).set(UFOID.now().toValue());
    }
    tribles.push(Uint8Array.from(trible) as Trible);
  }
  return tribles;
}

Deno.bench("put1e3", (b) => {
  const size = 1e3;
  let patch = emptyEAVTriblePATCH;
  b.start();
  for (const t of generate_sample(size)) {
    patch = patch.put(new Entry(t, undefined));
  }
  b.end();
});

Deno.bench("putBatch1e3", (b) => {
  const size = 1e3;
  let patch = emptyEAVTriblePATCH;
  const bt = batch();
  b.start();
  for (const t of generate_sample(size)) {
    patch = patch.put(new Entry(t, undefined), bt);
  }
  b.end();
});

Deno.bench("iterate1e3", (b) => {
  const size = 1e3;
  let patch = emptyEAVTriblePATCH;
  const bt = batch();
  for (const t of generate_sample(size)) {
    patch.put(new Entry(t, undefined), bt);
  }
  b.start();
  patch.keys();
  b.end();
});

/*
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
  b.end();
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
  b.end();
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
  b.end();
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
  b.end();
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
    b.end();
  } else {
    b.start();
    patchA.isSubsetOf(patchC);
    b.end();
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
    b.end();
  } else {
    b.start();
    patchA.isIntersecting(patchC);
    b.end();
  }
}

benchAllPATCH({
  name: "SetIntersecting",
  func: setIntersecting,
});
*/