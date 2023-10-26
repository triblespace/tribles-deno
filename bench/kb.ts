import { find, id, IDOwner, KB, NS, schemas, UFOID } from "../mod.ts";
import { Variable } from "../src/js/query.ts";

const nameId = UFOID.now();
const lastNameId = UFOID.now();
const ageId = UFOID.now();
const eyeColorId = UFOID.now();
const lovesId = UFOID.now();
const titlesId = UFOID.now();

const idOwner = new IDOwner(schemas.ufoid);
const knightsNS = new NS(idOwner.schema, {
  name: { id: nameId, schema: schemas.shortstring },
  lastName: { id: lastNameId, schema: schemas.shortstring },
  eyeColor: { id: eyeColorId, schema: schemas.shortstring },
  age: { id: ageId, schema: schemas.shortstring },
  loves: { id: lovesId, schema: idOwner.schema },
  titles: { id: titlesId, schema: schemas.shortstring },
});

function kbWith(b: Deno.BenchContext, size: number) {
  let knightskb = new KB();

  b.start();
  for (let i = 0; i < size; i++) {
    knightskb = knightsNS.entities(([romeo, juliet]) => [
      {
        [id]: romeo,
        name: `Romeo${i}`,
        loves: juliet,
      },
      ...["fool", "prince"].map(title => ({[id]: romeo, titles: title})),
      {
        [id]: juliet,
        name: `Juliet${i}`,
        loves: romeo,
      },
      ...["the lady", "princess"].map(title => ({[id]: juliet, titles: title})),
    ], knightskb);
  }
  b.end();
  console.log(knightskb.tribleset.count());
}

function kbQuery(b: Deno.BenchContext, size: number) {
  // Add some data.
  let knightskb = new KB();

  for (let i = 0; i < 1000; i++) {
    knightskb = knightsNS.entities(([romeo, juliet]) => [
      {
        [id]: romeo,
        name: `${i}LovingRomeo`,
        loves: juliet,
      },
      ...["fool", "prince"].map(title => ({[id]: romeo, titles: title})),
      {
        [id]: juliet,
        name: "Juliet",
        loves: romeo,
      },
      ...["the lady", "princess"].map(title => ({[id]: juliet, titles: title})),
    ], knightskb);
  }

  for (let i = 0; i < size; i++) {
    knightskb = knightsNS.entities(([romeo, juliet]) => [
      {
        [id]: romeo,
        name: `${i}Romeo`,
        loves: juliet,
      },
      ...["fool", "prince"].map(title => ({[id]: romeo, titles: title})),
      {
        [id]: juliet,
        name: `${i}Juliet`,
        loves: romeo,
      },
      ...["the lady", "princess"].map(title => ({[id]: juliet, titles: title})),
    ], knightskb);
  }

  // Query some data.
  const q = find((ctx, { name, title }, [juliet]:[Variable<UFOID>]) =>
    knightsNS.pattern(ctx, knightskb, [
      {
        name,
        titles: title,
        loves: juliet,
      },
      {[id]: juliet,
       name: "juliet"}
    ])
  );
  b.start();

  const results = [...q];

  b.end();
  console.log(results.length, knightskb.tribleset.count());
}

function getRandomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function kbDSQuery(b: Deno.BenchContext) {
  // Add some data.

  let peoplekb = new KB();
  for (let i = 0; i < 1250; i++) {
    peoplekb = knightsNS.entities(([ivan]) => [
      {
        [id]: ivan,
        name: "Ivan",
        lastName: `IvanSon${i}`,
        eyeColor: "blue",
        age: getRandomInt(100).toString(),
      },
    ], peoplekb);
  }

  for (let i = 0; i < 20000; i++) {
    peoplekb = knightsNS.entities(([ivan, bob, bob2]) => [
      {
        [id]: ivan,
        name: "Ivan",
        lastName: `IvanSon${i}`,
        eyeColor: "green",
        age: getRandomInt(100).toString(),
      },
      {
        [id]: bob,
        name: `${i}Bob`,
        lastName: `${i}Smith`,
        eyeColor: "green",
        age: getRandomInt(100).toString(),
      },
      {
        [id]: bob2,
        name: `${i}Bob`,
        lastName: `${i}Smith`,
        eyeColor: "blue",
        age: getRandomInt(100).toString(),
      },
    ], peoplekb);
  }

  // Query some data.
  // deno-lint-ignore no-empty-pattern
  const q = find((ctx, { age, lastName }, []) =>
    knightsNS.pattern(ctx, peoplekb, [
      {
        name: "Ivan",
        eyeColor: "blue",
        age,
        lastName,
      },
    ])
  );
  b.start();

  const results = [...q];

  b.end();
  console.log(results.length, peoplekb.tribleset.count());
}

function kbWithPeople(b: Deno.BenchContext, size: number) {
  b.start();
  let peoplekb = new KB();

  for (let i = 0; i < size; i++) {
    peoplekb = knightsNS.entities(([ivan, ivan2, bob, bob2]) => [
      {
        [id]: ivan,
        name: "Ivan",
        lastName: `IvanSon${i}`,
        eyeColor: "blue",
        age: getRandomInt(100).toString(),
      },
      {
        [id]: ivan2,
        name: "Ivan",
        lastName: `IvanSon${i}`,
        eyeColor: "green",
        age: getRandomInt(100).toString(),
      },
      {
        [id]: bob,
        name: `${i}Bob`,
        lastName: `${i}Smith`,
        eyeColor: "green",
        age: getRandomInt(100).toString(),
      },
      {
        [id]: bob2,
        name: `${i}Bob`,
        lastName: `${i}Smith`,
        eyeColor: "blue",
        age: getRandomInt(100).toString(),
      },
    ], peoplekb);
  }

  b.end();
  console.log(peoplekb.tribleset.count());
}
Deno.bench("kbWith1e4", (b) => kbWith(b, 1e4));
Deno.bench("kbQuery1e5", (b) => kbQuery(b, 1e5));
Deno.bench("kbDSQuery", (b) => kbDSQuery(b));
Deno.bench("kbWithPeople20k", (b) => kbWithPeople(b, 20000));
