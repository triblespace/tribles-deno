import { bench, runBenchmarks } from "https://deno.land/std/testing/bench.ts";
import {
  BlobCache,
  find,
  globalInvariants,
  id,
  KB,
  namespace,
  TribleSet,
  types,
  UFOID,
} from "../mod.js";

const { nameId, lastNameId, ageId, eyeColorId, lovesId, titlesId } =
  UFOID.namedCache();

globalInvariants({
  [nameId]: { isUnique: true },
  [lastNameId]: { isUnique: true },
  [lovesId]: { isLink: true, isUnique: true },
  [titlesId]: {},
  [eyeColorId]: { isUnique: true },
  [ageId]: { isUnique: true },
});

const knightsNS = namespace({
  [id]: { ...types.ufoid },
  name: { id: nameId, ...types.shortstring },
  lastName: { id: lastNameId, ...types.shortstring },
  eyeColor: { id: eyeColorId, ...types.shortstring },
  age: { id: ageId, ...types.shortstring },
  loves: { id: lovesId },
  lovedBy: { id: lovesId, isInverse: true },
  titles: { id: titlesId, ...types.shortstring },
});

function kbWith(b, size) {
  // Add some data.
  let knightskb = new KB(new TribleSet(), new BlobCache());

  b.start();
  knightskb = knightskb.with(knightsNS, ([romeo, juliet]) => [
    {
      [id]: romeo,
      name: "Romeo",
      titles: ["fool", "prince"],
      loves: juliet,
    },
    {
      [id]: juliet,
      name: "Juliet",
      titles: ["the lady", "princess"],
      loves: romeo,
    },
  ]);
  for (let i = 1; i < size; i++) {
    knightskb = knightskb.with(knightsNS, ([romeo, juliet]) => [
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
    ]);
  }
  b.stop();
}

function kbQuery(b, size) {
  // Add some data.
  let knightskb = new KB(new TribleSet(), new BlobCache());

  for (let i = 1; i < 1000; i++) {
    knightskb = knightskb.with(knightsNS, ([romeo, juliet]) => [
      {
        [id]: romeo,
        name: `RomeoClone${i}`,
        titles: ["fool", "prince"],
        loves: juliet,
      },
      {
        [id]: juliet,
        name: "Juliet",
        titles: ["the lady", "princess"],
        loves: romeo,
      },
    ]);
  }
  for (let i = 1; i < size; i++) {
    knightskb = knightskb.with(knightsNS, ([romeo, juliet]) => [
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
    ]);
  }
  b.start();
  // Query some data.
  const results = [
    ...find(knightsNS, ({ name, title }) => [
      knightskb.where([
        {
          name,
          titles: [title],
          loves: { name: "Juliet" },
        },
      ]),
    ]),
  ];
  console.log(results.length);
  b.stop();
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function kbDSQuery(b) {
  // Add some data.

  let peoplekb = new KB(new TribleSet(), new BlobCache());
  for (let i = 1; i < 1250; i++) {
    peoplekb = peoplekb.with(knightsNS, ([ivan]) => [
      {
        [id]: ivan,
        name: "Ivan",
        lastName: `IvanSon${i}`,
        eyeColor: "blue",
        age: getRandomInt(100),
      },
    ]);
  }
  for (let i = 1; i < 1250; i++) {
    peoplekb = peoplekb.with(knightsNS, ([ivan]) => [
      {
        [id]: ivan,
        name: "Ivan",
        lastName: `IvanSon${i}`,
        eyeColor: "green",
        age: getRandomInt(100),
      },
    ]);
  }
  for (let i = 1; i < 10000; i++) {
    peoplekb = peoplekb.with(knightsNS, ([bob]) => [
      {
        [id]: bob,
        name: `${i}Bob`,
        lastName: `${i}Smith`,
        eyeColor: "green",
        age: getRandomInt(100),
      },
    ]);
  }
  for (let i = 1; i < 10000; i++) {
    peoplekb = peoplekb.with(knightsNS, ([bob]) => [
      {
        [id]: bob,
        name: `${i}Bob`,
        lastName: `${i}Smith`,
        eyeColor: "blue",
        age: getRandomInt(100),
      },
    ]);
  }
  b.start();

  // Query some data.
  const results = [
    ...find(knightsNS, ({ age, lastName }) => [
      peoplekb.where([
        {
          name: "Ivan",
          eyeColor: "blue",
          age,
          lastName,
        },
      ]),
    ]),
  ];
  console.log(results.length);
  b.stop();
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

runBenchmarks();
