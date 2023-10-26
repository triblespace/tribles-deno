import {
  bench,
  runBenchmarks,
} from "https://deno.land/std@0.180.0/testing/bench.ts";
import { find, id, IDOwner, KB, NS, schemas, UFOID } from "../mod.ts";

const nameId = UFOID.now();
const lastNameId = UFOID.now();
const ageId = UFOID.now();
const eyeColorId = UFOID.now();
const lovesId = UFOID.now();
const titlesId = UFOID.now();

const idOwner = new IDOwner(schemas.ufoid);
const knightsNS = new NS({
  [id]: { schema: idOwner.type() },
  name: { id: nameId, schema: schemas.shortstring },
  lastName: { id: lastNameId, schema: schemas.shortstring },
  eyeColor: { id: eyeColorId, schema: schemas.shortstring },
  age: { id: ageId, schema: schemas.shortstring },
  loves: { id: lovesId, isLink: true },
  lovedBy: { id: lovesId, isLink: true, isInverse: true },
  titles: { id: titlesId, isMany: true, schema: schemas.shortstring },
});

function kbWith(b, size) {
  // Add some data.
  let knightskb = new KB();

  b.start();
  for (let i = 0; i < size; i++) {
    knightskb = knightsNS.entities(([romeo, juliet]) => [
      {
        [id]: romeo,
        name: `Romeo${i}`,
        titles: ["fool", "prince"],
        loves: juliet,
      },
      {
        [id]: juliet,
        name: `Juliet${i}`,
        titles: ["the lady", "princess"],
        loves: romeo,
      },
    ], knightskb);
  }
  b.stop();
  console.log(knightskb.tribleset.count());
}

function kbQuery(b, size) {
  // Add some data.
  let knightskb = new KB();

  for (let i = 0; i < 1000; i++) {
    knightskb = knightsNS.entities(([romeo, juliet]) => [
      {
        [id]: romeo,
        name: `${i}LovingRomeo`,
        titles: ["fool", "prince"],
        loves: juliet,
      },
      {
        [id]: juliet,
        name: "Juliet",
        titles: ["the lady", "princess"],
        loves: romeo,
      },
    ], knightskb);
  }

  for (let i = 0; i < size; i++) {
    knightskb = knightsNS.entities(([romeo, juliet]) => [
      {
        [id]: romeo,
        name: `${i}Romeo`,
        titles: ["fool", "prince"],
        loves: juliet,
      },
      {
        [id]: juliet,
        name: `${i}Juliet`,
        titles: ["the lady", "princess"],
        loves: romeo,
      },
    ], knightskb);
  }

  // Query some data.
  const q = find((ctx, { name, title }, []) =>
    knightsNS.pattern(ctx, knightskb, [
      {
        name,
        titles: [title],
        loves: { name: "Juliet" },
      },
    ])
  );
  b.start();

  const results = [...q];

  b.stop();
  console.log(results.length, knightskb.tribleset.count());
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function kbDSQuery(b) {
  // Add some data.

  let peoplekb = new KB();
  for (let i = 0; i < 1250; i++) {
    peoplekb = knightsNS.entities(([ivan]) => [
      {
        [id]: ivan,
        name: "Ivan",
        lastName: `IvanSon${i}`,
        eyeColor: "blue",
        age: getRandomInt(100),
      },
    ], peoplekb);
  }

  for (let i = 0; i < 20000; i++) {
    peoplekb = knightsNS.entities(([ivan, bob, bob2]) => [
      {
        [id]: ivan,
        name: "Ivan",
        lastName: `IvanSon${i}`,
        eyeColor: "green",
        age: getRandomInt(100),
      },
      {
        [id]: bob,
        name: `${i}Bob`,
        lastName: `${i}Smith`,
        eyeColor: "green",
        age: getRandomInt(100),
      },
      {
        [id]: bob2,
        name: `${i}Bob`,
        lastName: `${i}Smith`,
        eyeColor: "blue",
        age: getRandomInt(100),
      },
    ], peoplekb);
  }

  // Query some data.
  const q = find((ctx, { age, lastName }, []) =>
    knightsNS.pattern(ctx, peoplekb, [
      {
        name: "Ivan",
        eyeColor: "blue",
        age,
        lastName,
      },
    ])
  );
  b.start();

  const results = [...q];

  b.stop();
  console.log(results.length, peoplekb.tribleset.count());
}

function kbWithPeople(b, size) {
  b.start();
  let peoplekb = new KB();

  for (let i = 0; i < size; i++) {
    peoplekb = knightsNS.entities(([ivan, ivan2, bob, bob2]) => [
      {
        [id]: ivan,
        name: "Ivan",
        lastName: `IvanSon${i}`,
        eyeColor: "blue",
        age: getRandomInt(100),
      },
      {
        [id]: ivan2,
        name: "Ivan",
        lastName: `IvanSon${i}`,
        eyeColor: "green",
        age: getRandomInt(100),
      },
      {
        [id]: bob,
        name: `${i}Bob`,
        lastName: `${i}Smith`,
        eyeColor: "green",
        age: getRandomInt(100),
      },
      {
        [id]: bob2,
        name: `${i}Bob`,
        lastName: `${i}Smith`,
        eyeColor: "blue",
        age: getRandomInt(100),
      },
    ], peoplekb);
  }

  b.stop();
  console.log(peoplekb.tribleset.count());
}
bench({
  name: "kbWith1e4",
  runs: 3,
  func(b) {
    kbWith(b, 1e4);
  },
});

bench({
  name: "kbQuery1e5",
  runs: 3,
  func(b) {
    kbQuery(b, 1e5);
  },
});

bench({
  name: "kbDSQuery",
  runs: 3,
  func(b) {
    kbDSQuery(b);
  },
});

bench({
  name: "kbWithPeople20k",
  runs: 3,
  func(b) {
    kbWithPeople(b, 20000);
  },
});

runBenchmarks();
