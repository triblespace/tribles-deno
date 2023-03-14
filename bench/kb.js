import { bench, runBenchmarks } from "https://deno.land/std/testing/bench.ts";
import {
  BlobCache,
  find,
  id,
  IDOwner,
  KB,
  NS,
  TribleSet,
  types,
  UFOID,
} from "../mod.js";

const nameId = UFOID.now();
const lastNameId = UFOID.now();
const ageId = UFOID.now();
const eyeColorId = UFOID.now();
const lovesId = UFOID.now();
const titlesId = UFOID.now();

const idOwner = new IDOwner(types.ufoid);
const knightsNS = new NS({
  [id]: { ...idOwner.type() },
  name: { id: nameId, ...types.shortstring },
  lastName: { id: lastNameId, ...types.shortstring },
  eyeColor: { id: eyeColorId, ...types.shortstring },
  age: { id: ageId, ...types.shortstring },
  loves: { id: lovesId, isLink: true },
  lovedBy: { id: lovesId, isLink: true, isInverse: true },
  titles: { id: titlesId, isMany: true, ...types.shortstring },
});

function kbWith(b, size) {
  // Add some data.
  let knightskb = new KB();

  b.start();
  for (let i = 0; i < size; i++) {
    knightskb = knightskb.union(knightsNS.entities(([romeo, juliet]) => [
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
    ]));
  }
  b.stop();
  console.log(knightskb.tribleset.count());
}

function kbQuery(b, size) {
  // Add some data.
  let knightskb = new KB();

  for (let i = 0; i < 1000; i++) {
    knightskb = knightskb.union(knightsNS.entities(([romeo, juliet]) => [
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
    ]));
  }

  for (let i = 0; i < size; i++) {
    knightskb = knightskb.union(knightsNS.entities(([romeo, juliet]) => [
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
    ]));
  }

  // Query some data.
  const q = find(({ name, title }, anon) =>
    knightskb.where(knightsNS.pattern(anon, [
      {
        name,
        titles: [title],
        loves: { name: "Juliet" },
      },
    ]))
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
    peoplekb = peoplekb.union(knightsNS.entities(([ivan]) => [
      {
        [id]: ivan,
        name: "Ivan",
        lastName: `IvanSon${i}`,
        eyeColor: "blue",
        age: getRandomInt(100),
      },
    ]));
  }

  for (let i = 0; i < 20000; i++) {
    peoplekb = peoplekb.union(knightsNS.entities(([ivan, bob, bob2]) => [
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
    ]));
  }

  // Query some data.
  const q = find(({ age, lastName }, anon) =>
    peoplekb.where(knightsNS.pattern(anon, [
      {
        name: "Ivan",
        eyeColor: "blue",
        age,
        lastName,
      },
    ]))
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
    peoplekb = peoplekb.union(knightsNS.entities(([ivan, ivan2, bob, bob2]) => [
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
    ]));
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
