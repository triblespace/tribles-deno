import { bench, runBenchmarks } from "https://deno.land/std/testing/bench.ts";
import {
  ctx,
  find,
  id,
  MemBlobDB,
  MemTribleDB,
  TribleKB,
  types,
  UFOID,
} from "../mod.js";

function kbWith(b, size) {
  // Define a context, mapping between js data and tribles.
  const { nameId, lovesId, titlesId } = UFOID.namedCache();

  const knightsCtx = ctx({
    ns: {
      [id]: { ...types.ufoid },
      name: { id: nameId, ...types.shortstring },
      loves: { id: lovesId },
      lovedBy: { id: lovesId, isInverse: true },
      titles: { id: titlesId, ...types.shortstring },
    },
    constraints: {
      [nameId]: { isUnique: true },
      [lovesId]: { isLink: true, isUnique: true },
      [titlesId]: {},
    },
  });

  // Add some data.
  let knightskb = new TribleKB(new MemTribleDB(), new MemBlobDB());

  b.start();
  knightskb = knightskb.with(
    knightsCtx,
    (
      [romeo, juliet],
    ) => [
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
    ],
  );
  for (let i = 1; i < size; i++) {
    knightskb = knightskb.with(
      knightsCtx,
      (
        [romeo, juliet],
      ) => [
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
      ],
    );
  }
  b.stop();
}

function kbQuery(b, size) {
  // Define a context, mapping between js data and tribles.
  const { nameId, lovesId, titlesId } = UFOID.namedCache();

  const knightsCtx = ctx({
    ns: {
      [id]: { ...types.ufoid },
      name: { id: nameId, ...types.shortstring },
      loves: { id: lovesId },
      lovedBy: { id: lovesId, isInverse: true },
      titles: { id: titlesId, ...types.shortstring },
    },
    constraints: {
      [nameId]: { isUnique: true },
      [lovesId]: { isLink: true, isUnique: true },
      [titlesId]: {},
    },
  });

  // Add some data.
  let knightskb = new TribleKB(new MemTribleDB(), new MemBlobDB());

  knightskb = knightskb.with(
    knightsCtx,
    (
      [romeo, juliet],
    ) => [
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
    ],
  );
  for (let i = 1; i < size; i++) {
    knightskb = knightskb.with(
      knightsCtx,
      (
        [romeo, juliet],
      ) => [
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
      ],
    );
  }
  b.start();
  // Query some data.
  const results = [
    ...knightskb.find(knightsCtx, (
      { name, title },
    ) => [
      { name: name.at(0).ascend(), titles: [title], loves: { name: "Juliet" } },
    ]),
  ];
  b.stop();
}

bench({
  name: "kbWith1e3",
  runs: 3,
  func(b) {
    kbWith(b, 1e3);
  },
});

bench({
  name: "kbQuery1e3",
  runs: 10,
  func(b) {
    kbQuery(b, 1e3);
  },
});

runBenchmarks();
