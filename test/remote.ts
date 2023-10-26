import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.180.0/testing/asserts.ts";
import fc from "https://cdn.skypack.dev/fast-check";
fc.configureGlobal({
  numRuns: Number.MAX_SAFE_INTEGER,
  interruptAfterTimeLimit: 1000 * 5,
});

import { id, IDOwner, NS, types, UFOID } from "../mod.ts";

const nameId = UFOID.now();
const lovesId = UFOID.now();
const titlesId = UFOID.now();

Deno.test("KB Find", () => {
  const idOwner = new IDOwner(types.ufoid);
  const knightsNS = new NS({
    [id]: { ...idOwner.type() },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId, isLink: true },
    lovedBy: { id: lovesId, isLink: true, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const knightskb = knightsNS.entities(([romeo, juliet]) => [{
    [id]: romeo,
    name: "Romeo",
    titles: ["fool", "prince"],
    loves: juliet,
  }, {
    [id]: juliet,
    name: "Juliet",
    titles: ["the lady", "princess"],
    loves: romeo,
  }]);

  assertEquals(
    results,
    new Set([
      { name: "Romeo", title: "fool" },
      { name: "Romeo", title: "prince" },
      { name: "Juliet", title: "princess" },
      { name: "Juliet", title: "the lady" },
    ]),
  );
});
