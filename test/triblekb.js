import {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import fc from "https://cdn.skypack.dev/fast-check";
fc.configureGlobal(
  {
    numRuns: Number.MAX_SAFE_INTEGER,
    interruptAfterTimeLimit: (1000 * 5),
  },
);

import {
  decode,
  encode,
} from "https://deno.land/std@0.78.0/encoding/base64.ts";

import { equal, equalValue } from "../src/trible.js";
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

Deno.test("KB Find", () => {
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
  const memkb = new TribleKB(knightsCtx, new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(
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

  // Query some data.
  const results = [
    ...knightskb.find((
      { name, title },
    ) => [{ name: name.ascend(), titles: [title] }]),
  ];
  assertEquals(results, [
    { name: "Juliet", title: "princess" },
    { name: "Juliet", title: "the lady" },
    { name: "Romeo", title: "fool" },
    { name: "Romeo", title: "prince" },
  ]);
});

Deno.test("KB Find Single", () => {
  const arbitraryIdHex = fc.hexaString({ minLength: 32, maxLength: 32 }).map(
    (hex) => hex.padStart(64, "0"),
  );
  const arbitraryValueHex = fc.hexaString({ minLength: 64, maxLength: 64 });
  const arbitraryTitles = fc.array(arbitraryValueHex, {
    minLength: 1,
    maxLength: 1,
  });
  const arbitraryPerson = fc.record({
    id: arbitraryIdHex,
    name: arbitraryValueHex,
    titles: arbitraryTitles,
  });

  fc.assert(
    fc.property(
      arbitraryIdHex,
      arbitraryIdHex,
      arbitraryPerson,
      (nameId, titlesId, person) => {
        const knightsCtx = ctx({
          ns: {
            [id]: { ...types.hex },
            name: { id: nameId, ...types.hex },
            titles: { id: titlesId, ...types.hex },
          },
          constraints: {
            [nameId]: { isUnique: true },
            [titlesId]: {},
          },
        });

        const knightskb = new TribleKB(
          knightsCtx,
          new MemTribleDB(),
          new MemBlobDB(),
        ).with(
          () => [{ [id]: person.id, name: person.name, titles: person.titles }],
        );

        /// Query some data.
        const results = [
          ...knightskb.find((
            { name, title },
          ) => [{ name, titles: [title] }]),
        ];
        assertEquals(results, [{ name: person.name, title: person.titles[0] }]);
      },
    ),
  );
});

Deno.test("Find Ascending", () => {
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
  const memkb = new TribleKB(knightsCtx, new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(
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

  // Query some data.
  const results = [
    ...find(
      knightsCtx,
      (
        { person, name, title },
      ) => [
        knightskb.where({
          [id]: person.groupBy(name.ascend()).omit(),
          name,
          titles: [title],
        }),
      ],
      knightskb.blobdb,
    ),
  ];
  assertEquals(results, [
    { name: "Juliet", title: "princess" },
    { name: "Juliet", title: "the lady" },
    { name: "Romeo", title: "fool" },
    { name: "Romeo", title: "prince" },
  ]);
});

Deno.test("Find Descending", () => {
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
  const memkb = new TribleKB(knightsCtx, new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(
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
  // Query some data.
  const results = [
    ...find(
      knightsCtx,
      (
        { person, name, title },
      ) => [
        knightskb.where({
          [id]: person.groupBy(name.descend()).omit(),
          name,
          titles: [title],
        }),
      ],
      knightskb.blobdb,
    ),
  ];
  assertEquals(results, [
    { name: "Romeo", title: "fool" },
    { name: "Romeo", title: "prince" },
    { name: "Juliet", title: "princess" },
    { name: "Juliet", title: "the lady" },
  ]);
});

Deno.test("unique constraint", () => {
  // Define a context, mapping between js data and tribles.
  const { nameId, lovesId, titlesId, romeoId } = UFOID.namedCache();

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
  const memkb = new TribleKB(knightsCtx, new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(
    (
      [juliet],
    ) => [
      {
        [id]: romeoId,
        name: "Romeo",
        titles: ["fool", "prince"],
        loves: juliet,
      },
      {
        [id]: juliet,
        name: "Juliet",
        titles: ["the lady", "princess"],
        loves: romeoId,
      },
    ],
  );
  assertThrows(
    () => {
      knightskb.with(
        () => [
          {
            [id]: romeoId,
            name: "Bob",
          },
        ],
      );
    },
    Error,
    "",
  );
});

Deno.test("unique inverse constraint", () => {
  // Define a context, mapping between js data and tribles.
  const { nameId, motherOfId, romeoId } = UFOID.namedCache();

  const knightsCtx = ctx({
    ns: {
      [id]: { ...types.ufoid },
      name: { id: nameId, ...types.shortstring },
      motherOf: { id: motherOfId },
    },
    constraints: {
      [nameId]: { isUnique: true },
      [motherOfId]: { isLink: true, isUniqueInverse: true },
    },
  });

  // Add some data.
  const memkb = new TribleKB(knightsCtx, new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(
    () => [
      {
        [id]: romeoId,
        name: "Romeo",
      },
      {
        name: "Lady Montague",
        motherOf: [romeoId],
      },
    ],
  );
  assertThrows(
    () => {
      knightskb.with(
        () => [
          {
            name: "Lady Impostor",
            motherOf: [romeoId],
          },
        ],
      );
    },
    Error,
    "",
  );
});

Deno.test("KB Walk", () => {
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
  const memkb = new TribleKB(knightsCtx, new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(
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
  // Query some data.
  const [{ romeo }] = [
    ...knightskb.find((
      { romeo },
    ) => [{ [id]: romeo.walk(knightskb), name: "Romeo" }]),
  ];
  assertEquals(romeo.loves.name, "Juliet");
});
