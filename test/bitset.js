import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import fc from "https://cdn.skypack.dev/fast-check";

/*
fc.configureGlobal({
  numRuns: Number.MAX_SAFE_INTEGER,
  interruptAfterTimeLimit: 1000 * 300,
});
*/

import { ByteBitset } from "../src/js/bitset.js";

const arb_byte = fc.integer({ min: 0, max: 255 });

Deno.test("bitset range", () => {
  fc.assert(
    fc.property(arb_byte, arb_byte, (lower, upper) => {
      fc.pre(lower <= upper);
      const set = new ByteBitset();
      set.setRange(lower, upper);
      for (let i = 0; i < 255; i++) {
        assertEquals(lower <= i && i <= upper, set.has(i));
      }
    }),
  );
});
