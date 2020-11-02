import {
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.75.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.76.0/uuid/mod.ts";

import { TribleKB } from "./triblekb.js";
import { types } from "./types.js";

Deno.test("Integration", () => {
  const observation_attr = v4.generate();
  const todo_ctx = {
    [id]: { ...id_type, id: v4.generate },
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
      ...shortstring_type,
      id: v4.generate(),
    },
    state: {
      isLink: true,
      id: v4.generate(),
    },
    stamp: {
      ...spacetime_type,
      id: v4.generate(),
    },
  };
  const kb = new TripleKB();

  assertEquals(x, 3);
});
