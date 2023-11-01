import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.180.0/testing/asserts.ts";
import fc from "https://cdn.skypack.dev/fast-check";
fc.configureGlobal({
  numRuns: Number.MAX_SAFE_INTEGER,
  interruptAfterTimeLimit: 1000 * 5,
});

import {
  and,
  find,
  id,
  IDOwner,
  KB,
  NS,
  ranged,
  schemas,
  UFOID,
} from "../mod.ts";
import { FixedUint8Array } from "../src/js/util.ts";

const nameId = UFOID.now();
const lovesId = UFOID.now();
const titlesId = UFOID.now();

Deno.test("KB Find", () => {
  const idOwner = new IDOwner(schemas.ufoid);
  const knightsNS = new NS(idOwner.schema, {
    name: { id: nameId, schema: schemas.shortstring },
    loves: { id: lovesId, schema: idOwner.schema },
    titles: { id: titlesId, schema: schemas.shortstring },
  });

  // Add some data.
  const knightskb = knightsNS.entities(([romeo, juliet]) => [
    {
      [id]: romeo,
      name: "Romeo",
      loves: juliet,
    },
    { [id]: romeo, titles: "fool" },
    { [id]: romeo, titles: "prince" },
    {
      [id]: juliet,
      name: "Juliet",
      loves: romeo,
    },
    {
      [id]: juliet,
      titles: "the lady",
    },
    {
      [id]: juliet,
      titles: "princess",
    },
  ]);

  debugger;
  // Query some data.
  const results = new Set([
    // deno-lint-ignore no-empty-pattern
    ...find((ctx, { name, title }, []) =>
      knightsNS.pattern(ctx, knightskb, [{
        name: name,
        titles: title,
      }])
    ),
  ]);
  assertEquals(
    new Set([
      { name: "Romeo", title: "fool" },
      { name: "Romeo", title: "prince" },
      { name: "Juliet", title: "princess" },
      { name: "Juliet", title: "the lady" },
    ]),
    results,
  );
});

Deno.test("KB Find Single", () => {
  const arbitraryId = fc
    .uint8Array({ minLength: 16, maxLength: 16 })
    .filter((bytes: FixedUint8Array<16>) =>
      bytes.some((byte: number) => byte !== 0)
    )
    .map((bytes: FixedUint8Array<16>) => new UFOID(bytes));
  const arbitraryValueHex = fc.hexaString({ minLength: 64, maxLength: 64 });
  const arbitraryPerson = fc.record({
    id: arbitraryId,
    name: arbitraryValueHex,
    titles: arbitraryValueHex,
  });

  fc.assert(
    fc.property(
      arbitraryId,
      arbitraryId,
      arbitraryPerson,
      (
        nameId: UFOID,
        titlesId: UFOID,
        person: { id: UFOID; name: string; titles: string },
      ) => {
        const idOwner = new IDOwner(schemas.ufoid);
        const knightsNS = new NS(idOwner.schema, {
          name: { id: nameId, schema: schemas.hex },
          titles: { id: titlesId, schema: schemas.hex },
        });

        const knightskb = knightsNS.entities(() => [{
          [id]: person.id,
          name: person.name,
          titles: person.titles,
        }]);

        /// Query some data.
        const results = new Set([
          ...find((ctx, { name, title }, []) =>
            knightsNS.pattern(ctx, knightskb, [{
              name,
              titles: title,
            }])
          ),
        ]);
        assertEquals(
          new Set([{ name: person.name, title: person.titles }]),
          results,
        );
      },
    ),
  );
});

/*
Deno.test("find lower range", () => {
  const idOwner = new IDOwner(schemas.ufoid);
  const knightsNS = new NS(idOwner.schema, {
    name: { id: nameId, schema: schemas.shortstring },
    loves: { id: lovesId, schema: idOwner.schema },
    titles: { id: titlesId, schema: schemas.shortstring },
  });

  // Add some data.
  const knightskb = knightsNS.entities(([romeo, juliet]) => [
    {
      [id]: romeo,
      name: "Romeo",
      loves: juliet,
    },
    {
      [id]: romeo,
      titles: "fool",
    },
    {
      [id]: romeo,
      titles: "prince",
    },
    {
      [id]: juliet,
      name: "Juliet",
      loves: romeo,
    },
    {
      [id]: juliet,
      titles: "the lady",
    },
    {
      [id]: juliet,
      titles: "princess",
    },
  ]);
  // Query some data.
  const results = [
    ...find(
      (ctx, { name, title }, []) =>
        and(
          name.typed(schemas.shortstring).lower("K")),
          knightsNS.pattern(ctx, knightskb, [{
            name,
            titles: [title],
          }]),
        ),
    ),
  ];
  assertEquals(results, [
    { name: "Romeo", title: "fool" },
    { name: "Romeo", title: "prince" },
  ]);
});

Deno.test("find upper bound", () => {
  const idOwner = new IDOwner(schemas.ufoid);
  const knightsNS = new NS(idOwner.schema, {
    name: { id: nameId, schema: schemas.shortstring },
    loves: { id: lovesId, schema: idOwner.schema },
    titles: { id: titlesId, schema: schemas.shortstring },
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

  // Query some data.

  const results = [
    ...find((ctx, { name, title }, []) =>
      and(
        name.typed(schemas.shortstring).ranged({ upper: "K" }),
        knightsNS.pattern(ctx, knightskb, [{
          name,
          titles: [title],
        }]),
      )
    ),
  ];
  assertEquals(results, [
    { name: "Juliet", title: "princess" },
    { name: "Juliet", title: "the lady" },
  ]);
});
*/
/*
Deno.test("TribleSet PATCH segmentCount positive", () => {
  const size = 3;

  const idOwner = new IDOwner(schemas.ufoid);
  const knightsNS = new NS(idOwner.schema, {
    name: { id: nameId, schema: schemas.shortstring },
    loves: { id: lovesId, schema: idOwner.schema },
    titles: { id: titlesId, schema: schemas.shortstring },
  });

  // Add some data.
  let knightskb = new KB();

  knightskb = knightskb.union(
    knightsNS.entities(([romeo, juliet]) => [{
      [id]: romeo,
      name: "Romeo",
      loves: juliet,
    },
    {[id]: romeo,
      titles: "fool",
    },
    {[id]: romeo,
      titles: "prince",
    },
    {
      [id]: juliet,
      name: "Juliet",
      loves: romeo,
    },
    {
      [id]: juliet,
      titles: "the lady",
    },
    {
      [id]: juliet,
      titles: "princess",
    }]),
  );
  for (let i = 1; i < size; i++) {
    knightskb = knightskb.union(
      knightsNS.entities(
        ([romeo, juliet]) => [{
          [id]: romeo,
          name: `Romeo${i}`,
          loves: juliet,
        },
        {[id]: romeo,
          titles: "fool",
        },
        {[id]: romeo,
          titles: "prince",
        },
        {
          [id]: juliet,
          name: `Juliet${i}`,
          loves: romeo,
        },
        {
          [id]: juliet,
          titles: "the lady",
        },
        {
          [id]: juliet,
          titles: "princess",
        }],
      ),
    );
  }
  const work = [knightskb.tribleset.EAV.child];
  while (work.length > 0) {
    const c = work.shift();
    if (c && c.constructor.name === "Branch") {
      if (c.segmentCount < 0) console.log(c._segmentCount);
      assert(c._segmentCount >= 0);
      if (c.children) work.push(...c.children);
    }
  }
});
*/
