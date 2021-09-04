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

const { nameId, lovesId, titlesId } = UFOID.namedCache();

globalInvariants({
  [nameId]: { isUnique: true },
  [lovesId]: { isLink: true, isUnique: true },
  [titlesId]: {},
});

const knightsNS = namespace({
  [id]: { ...types.ufoid },
  name: { id: nameId, ...types.shortstring },
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
  b.start();
  // Query some data.
  const results = [
    ...find(knightsNS, ({ name, title }) => [
      knightskb.where([
        {
          name: "Romeo",
          titles: [title],
          loves: { name },
        },
      ]),
    ]),
  ];
  //console.log(results.length);
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
  name: "kbQuery1e4",
  runs: 10,
  func(b) {
    kbQuery(b, 1e4);
  },
});

runBenchmarks();
