import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import fc from "https://cdn.skypack.dev/fast-check";
fc.configureGlobal({
  numRuns: Number.MAX_SAFE_INTEGER,
  interruptAfterTimeLimit: 1000 * 5,
});

import {
  BlobCache,
  find,
  FOTribleSet,
  id,
  IDOwner,
  KB,
  NS,
  types,
  UFOID,
} from "../mod.js";

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
    titles: { id: titlesId, ...types.shortstring, isMany: true },
  });

  // Add some data.
  const memkb = new KB(new FOTribleSet(), new BlobCache());

  const knightskb = memkb.with(
    knightsNS,
    ([romeo, juliet]) => [
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

  // Query some data.
  const results = new Set([
    ...find(({ name, title }) =>
      knightskb.where(knightsNS, [{
        name: name,
        titles: [title],
      }])
    ),
  ]);
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

Deno.test("KB Find Single", () => {
  const arbitraryId = fc
    .uint8Array({ minLength: 16, maxLength: 16 })
    .filter((bytes) => bytes.some((byte) => byte !== 0))
    .map((bytes) => new UFOID(bytes));
  const arbitraryValueHex = fc.hexaString({ minLength: 64, maxLength: 64 });
  const arbitraryTitles = fc.array(arbitraryValueHex, {
    minLength: 1,
    maxLength: 1,
  });
  const arbitraryPerson = fc.record({
    id: arbitraryId,
    name: arbitraryValueHex,
    titles: arbitraryTitles,
  });

  fc.assert(
    fc.property(
      arbitraryId,
      arbitraryId,
      arbitraryPerson,
      (nameId, titlesId, person) => {
        const idOwner = new IDOwner(types.ufoid);
        const knightsNS = new NS({
          [id]: { ...idOwner.type() },
          name: { id: nameId, ...types.hex },
          titles: { id: titlesId, ...types.hex, isMany: true },
        });

        const knightskb = new KB(new FOTribleSet(), new BlobCache()).with(
          knightsNS,
          () => [{ [id]: person.id, name: person.name, titles: person.titles }],
        );

        /// Query some data.
        const results = new Set([
          ...find(({ name, title }) =>
            knightskb.where(knightsNS, [{
              name,
              titles: [title],
            }])
          ),
        ]);
        assertEquals(
          results,
          new Set([{ name: person.name, title: person.titles[0] }]),
        );
      },
    ),
  );
});

Deno.test("find lower range", () => {
  const idOwner = new IDOwner(types.ufoid);
  const knightsNS = new NS({
    [id]: { ...idOwner.type() },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId, isLink: true },
    lovedBy: { id: lovesId, isLink: true, isInverse: true },
    titles: { id: titlesId, isMany: true, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new FOTribleSet(), new BlobCache());

  const knightskb = memkb.with(
    knightsNS,
    ([romeo, juliet]) => [
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
  // Query some data.
  const results = [
    ...find(
      ({ name, title }) =>
        knightskb.where(knightsNS, [
          {
            name: name.ranged({ lower: "K" }),
            titles: [title],
          },
        ]),
      knightskb.blobcache,
    ),
  ];
  assertEquals(results, [
    { name: "Romeo", title: "fool" },
    { name: "Romeo", title: "prince" },
  ]);
});

Deno.test("find upper bound", () => {
  const idOwner = new IDOwner(types.ufoid);
  const knightsNS = new NS({
    [id]: { ...idOwner.type() },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId, isLink: true },
    lovedBy: { id: lovesId, isLink: true, isInverse: true },
    titles: { id: titlesId, isMany: true, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new FOTribleSet(), new BlobCache());

  const knightskb = memkb.with(
    knightsNS,
    ([romeo, juliet]) => [
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

  // Query some data.

  const results = [
    ...find(({ name, title }) =>
      knightskb.where(knightsNS, [
        {
          name: name.ranged({ upper: "K" }),
          titles: [title],
        },
      ])
    ),
  ];
  assertEquals(results, [
    { name: "Juliet", title: "princess" },
    { name: "Juliet", title: "the lady" },
  ]);
});

Deno.test("KB Walk", () => {
  const idOwner = new IDOwner(types.ufoid);
  const knightsNS = new NS({
    [id]: { ...idOwner.type() },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId, isLink: true },
    lovedBy: { id: lovesId, isLink: true, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new FOTribleSet(), new BlobCache());

  const knightskb = memkb.with(
    knightsNS,
    ([romeo, juliet]) => [
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
  // Query some data.
  debugger;
  const [{ romeo }] = [
    ...find(({ romeo }) =>
      knightskb.where(knightsNS, [
        { [id]: romeo, name: "Romeo" },
      ])
    ),
  ];
  assertEquals(
    knightskb.walk(knightsNS, romeo).loves.name,
    "Juliet",
  );
});

Deno.test("KB Walk ownKeys", () => {
  const idOwner = new IDOwner(types.ufoid);
  const knightsNS = new NS({
    [id]: { ...idOwner.type() },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId, isLink: true },
    lovedBy: { id: lovesId, isLink: true, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new FOTribleSet(), new BlobCache());

  const knightskb = memkb.with(
    knightsNS,
    ([romeo, juliet]) => [
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
  // Query some data.
  const [{ romeo }] = [
    ...find(({ romeo }) =>
      knightskb.where(knightsNS, [
        { [id]: romeo, name: "Romeo" },
      ])
    ),
  ];
  assertEquals(
    new Set(
      Reflect.ownKeys(knightskb.walk(knightsNS, romeo)),
    ),
    new Set([id, "name", "titles", "loves", "lovedBy"]),
  );
});

Deno.test("TribleSet PACT segmentCount positive", () => {
  const size = 3;

  const idOwner = new IDOwner(types.ufoid);
  const knightsNS = new NS({
    [id]: { ...idOwner.type() },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId, isLink: true },
    lovedBy: { id: lovesId, isLink: true, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  let knightskb = new KB(new FOTribleSet(), new BlobCache());

  knightskb = knightskb.with(
    knightsNS,
    ([romeo, juliet]) => [
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
      knightsNS,
      ([romeo, juliet]) => [
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
  const work = [knightskb.tribleset.EAV.child];
  while (work.length > 0) {
    const c = work.shift();
    if (c && c.constructor.name === "PACTNode") {
      if (c._segmentCount < 0) console.log(c._segmentCount);
      assert(c._segmentCount >= 0);
      if (c.children) work.push(...c.children);
    }
  }
});
