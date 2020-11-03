import {
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.75.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.76.0/uuid/mod.ts";

import { id, TribleKB } from "./triblekb.js";
import { types } from "./types.js";

Deno.test("Integration", () => {
  const observation_attr = v4.generate();
  const state_open = v4.generate();
  const state_done = v4.generate();

  const todo_ctx = {
    [id]: { ...types.id, id: v4.generate },
    observationOf: {
      isLink: true,
      isMany: true,
      id: observation_attr,
    },
    observedAs: {
      isInverse: true,
      id: observation_attr,
    },
    task: {
      ...types.shortstring,
      id: v4.generate(),
    },
    state: {
      isLink: true,
      id: v4.generate(),
    },
    stamp: {
      ...types.spacetimestamp,
      id: v4.generate(),
    },
    creator: {
      isLink: true,
      id: v4.generate(),
    },
    name: {
      ...types.shortstring,
      id: v4.generate(),
    },
  };
  const kb = new TribleKB();
  let todos = new TribleKB().with(todo_ctx, ([t]) => [
    {
      task: "Get soymilk!",
      observedAs: [
        { state: state_open, stamp: { t: 0n, x: 0n, y: 0n, z: 0n } },
      ],
      creator: { name: "jp" },
    },
  ]);

  assertEquals([
    ...todos.find(todo_ctx, ({ observation, stamp, task }) => [
      {
        [id]: observation,
        stamp: stamp.at(0),
        observationOf: { task },
        creator: { name: "jp" },
      },
    ]),
  ], [
    {
      observation: observation_id,
      task: "Get soy!",
      stamp: { t: 0n, x: 0n, y: 0n, z: 0n },
    },
  ]);
});
