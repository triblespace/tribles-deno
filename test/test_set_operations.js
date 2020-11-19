import {
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.75.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.76.0/uuid/mod.ts";
import {
  decode,
  encode,
} from "https://deno.land/std@0.76.0/encoding/base64.ts";

import fc from "https://cdn.skypack.dev/fast-check";
fc.configureGlobal({ numRuns: 3, interruptAfterTimeLimit: 4000 });

import { equal } from "../src/trible.js";
import { TRIBLE_PART, VALUE_PART } from "../src/part.js";

Deno.test("TRIBLE_PART set difference no heritage", () => {
  const trible = fc.array(fc.nat(255), { minLength: 64, maxLength: 64 }).map(
    (a) => new Uint8Array(a),
  );
  const tribles = fc.set(trible, { compare: equal });
  const trible_sets = tribles.chain((ts) =>
    fc.tuple(fc.subarray(ts), fc.subarray(ts))
  );

  fc.assert(
    fc.property(trible_sets, ([l, r]) => {
      const ls = new Set(l.map((t) => encode(t)));
      const rs = new Set(r.map((t) => encode(t)));
      const diffs = [...ls].filter((x) => !rs.has(x)).map((t) => decode(t));

      const lp = l.reduce((part, trible) => part.put(trible), TRIBLE_PART);
      const rp = r.reduce((part, trible) => part.put(trible), TRIBLE_PART);
      const diffp = lp.difference(rp);

      const diff = [...diffp];

      assertEquals(diff, diffs);
    }),
  );
});
