import { assertEquals } from "https://deno.land/std@0.180.0/testing/asserts.ts";

import { ByteBitset } from "../src/js/bitset.ts";

Deno.test("bitset range", () => {
  for (let lower = 0; lower < 255; lower++) {
    for (let upper = 0; upper < 255; upper++) {
      const set = new ByteBitset();
      set.setRange(lower, upper);
      for (let i = 0; i < 255; i++) {
        assertEquals(lower <= i && i <= upper, set.has(i));
      }
    }
  }
});
