import { bench, runBenchmarks } from "https://deno.land/std/testing/bench.ts";
import { BlobCache, find, FOTribleSet, id, KB, types, UFOID } from "../mod.js";

const { nameId, lastNameId, ageId, eyeColorId, lovesId, titlesId } = UFOID
  .namedCache();

const knightsNS = {
  [id]: { ...types.ufoid },
  name: { id: nameId, ...types.shortstring },
  lastName: { id: lastNameId, ...types.shortstring },
  eyeColor: { id: eyeColorId, ...types.shortstring },
  age: { id: ageId, ...types.shortstring },
  loves: { id: lovesId, isLink: true },
  lovedBy: { id: lovesId, isLink: true, isInverse: true },
  titles: { id: titlesId, isMany: true, ...types.shortstring },
};

function kbWith(b, size) {
  // Add some data.
  let knightskb = new KB(new FOTribleSet(), new BlobCache());

  b.start();
  knightskb = knightskb.with(knightsNS, function* (ids) {
    for (let i = 0; i < size; i++) {
      let [romeo, juliet] = ids;
      yield* [
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
      ];
    }
  });
  b.stop();
  console.log(knightskb.tribleset.count());
}

function kbQuery(b, size) {
  // Add some data.
  let knightskb = new KB(new FOTribleSet(), new BlobCache());

  knightskb = knightskb.with(knightsNS, function* (ids) {
    for (let i = 0; i < 1000; i++) {
      const [romeo, juliet] = ids;
      yield* [
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
      ];
    }
  });

  knightskb = knightskb.with(knightsNS, function* (ids) {
    for (let i = 0; i < size; i++) {
      const [romeo, juliet] = ids;
      yield* [
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
      ];
    }
  });

  debugger;
  // Query some data.
  const q = find(({ name, title }) => [
    knightskb.where(knightsNS, [
      {
        name,
        titles: [title],
        loves: { name: "Juliet" },
      },
    ]),
  ]);
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

  let peoplekb = new KB(new FOTribleSet(), new BlobCache());
  peoplekb = peoplekb.with(knightsNS, function* (ids) {
    for (let i = 0; i < 1250; i++) {
      const [ivan] = ids;
      yield {
        [id]: ivan,
        name: "Ivan",
        lastName: `IvanSon${i}`,
        eyeColor: "blue",
        age: getRandomInt(100),
      };
    }
  });

  peoplekb = peoplekb.with(knightsNS, function* (ids) {
    for (let i = 0; i < 20000; i++) {
      const [ivan, bob, bob2] = ids;
      yield* [
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
      ];
    }
  });

  // Query some data.
  const q = find(({ age, lastName }) => [
    peoplekb.where(knightsNS, [
      {
        name: "Ivan",
        eyeColor: "blue",
        age,
        lastName,
      },
    ]),
  ]);
  b.start();

  const results = [...q];

  b.stop();
  console.log(results.length, peoplekb.tribleset.count());
}

function kbWithPeople(b, size) {
  b.start();
  let peoplekb = new KB(new FOTribleSet(), new BlobCache());

  peoplekb = peoplekb.with(knightsNS, function* (ids) {
    for (let i = 0; i < size; i++) {
      const [ivan, ivan2, bob, bob2] = ids;
      yield* [
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
      ];
    }
  });
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
