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
  find,
  globalInvariants,
  id,
  MemBlobDB,
  MemTribleDB,
  namespace,
  KB,
  types,
  UFOID,
} from "../mod.js";

const { nameId, lovesId, titlesId, motherOfId, romeoId } = UFOID
  .namedCache();

globalInvariants({
  [nameId]: { isUnique: true },
  [lovesId]: { isLink: true, isUnique: true },
  [titlesId]: {},
});

globalInvariants({
  [nameId]: { isUnique: true },
  [motherOfId]: { isLink: true, isUniqueInverse: true },
});

Deno.test("KB Find", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new MemTribleDB(), new MemBlobDB());

  debugger;
  const knightskb = memkb.with(knightsNS, (
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
  ]);

  // Query some data.
  const results = [
    ...knightskb.find(knightsNS, (
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
  const arbitraryIdHex = fc.hexaString({ minLength: 32, maxLength: 32 });
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
        globalInvariants({
          [nameId]: { isUnique: true },
          [titlesId]: {},
        });
        const knightsNS = namespace({
          [id]: { ...types.ufoid },
          name: { id: nameId, ...types.hex },
          titles: { id: titlesId, ...types.hex },
        });

        const knightskb = new KB(
          new MemTribleDB(),
          new MemBlobDB(),
        ).with(
          knightsNS,
          () => [{ [id]: person.id, name: person.name, titles: person.titles }],
        );

        /// Query some data.
        const results = [
          ...knightskb.find(knightsNS, (
            { name, title },
          ) => [{ name, titles: [title] }]),
        ];
        assertEquals(results, [{ name: person.name, title: person.titles[0] }]);
      },
    ),
  );
});

Deno.test("Find Ascending", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(knightsNS, (
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
  ]);

  // Query some data.
  const results = [
    ...find(
      knightsNS,
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
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(knightsNS, (
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
  ]);
  // Query some data.
  const results = [
    ...find(
      knightsNS,
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
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(knightsNS, (
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
  ]);
  assertThrows(
    () => {
      knightskb.with(knightsNS, () => [
        {
          [id]: romeoId,
          name: "Bob",
        },
      ]);
    },
    Error,
    "",
  );
});

Deno.test("unique inverse constraint", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    motherOf: { id: motherOfId },
  });

  // Add some data.
  const memkb = new KB(new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(knightsNS, () => [
    {
      [id]: romeoId,
      name: "Romeo",
    },
    {
      name: "Lady Montague",
      motherOf: [romeoId],
    },
  ]);
  assertThrows(
    () => {
      knightskb.with(knightsNS, () => [
        {
          name: "Lady Impostor",
          motherOf: [romeoId],
        },
      ]);
    },
    Error,
    "",
  );
});

Deno.test("KB Walk", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(knightsNS, (
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
  ]);
  // Query some data.
  debugger;
  const [{ romeo }] = [
    ...knightskb.find(knightsNS, (
      { romeo },
    ) => [{ [id]: romeo.walk(knightskb), name: "Romeo" }]),
  ];
  assertEquals(romeo.loves.name, "Juliet");
});

Deno.test("KB Walk ownKeys", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(knightsNS, (
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
  ]);
  // Query some data.
  debugger;
  const [{ romeo }] = [
    ...knightskb.find(knightsNS, (
      { romeo },
    ) => [{ [id]: romeo.walk(knightskb), name: "Romeo" }]),
  ];
  assertEquals(new Set(Reflect.ownKeys(romeo)), new Set([id, "name", "titles", "loves", "lovedBy"]));
});