import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.180.0/testing/asserts.ts";
import fc from "https://cdn.skypack.dev/fast-check";

/*
fc.configureGlobal({
  numRuns: Number.MAX_SAFE_INTEGER,
  interruptAfterTimeLimit: 1000 * 300,
});
*/

import { encode } from "https://deno.land/std@0.180.0/encoding/base64.ts";

import { equalValue } from "../src/js/trible.js";
import { emptyValuePATCH, makePATCH } from "../src/js/patch.js";

const arb_number_of_segments = fc.integer({ min: 1, max: 3 });
const arb_segment_size = fc.integer({ min: 1, max: 3 });
const arb_segment_sizes = arb_number_of_segments.chain((n) =>
  fc.array(arb_segment_size, { minLength: n, maxLength: n })
);

function arb_segmented_keys_(segments) {
  if (segments.length === 0) {
    return fc.constant([[]]);
  }
  const [s, ...sRest] = segments;
  return fc
    .tuple(
      fc.uint8Array({ minLength: s, maxLength: s }),
      fc.array(arb_segmented_keys(sRest), {
        minLength: 1,
        maxLength: 10,
      }),
    )
    .map(([l, rs]) => {
      return rs.flat().map((r) => [...l, ...r]);
    });
}

function arb_segmented_keys(segments) {
  return fc
    .array(arb_segmented_keys_(segments), {
      minLength: 1,
      maxLength: 10,
    })
    .map((as) => as.flat().map((a) => new Uint8Array(a)));
}

const arb_patch_and_content = arb_segment_sizes.chain((segments) =>
  fc.tuple(
    fc.constant(makePATCH(segments)),
    fc.array(arb_segmented_keys(segments), {
      minLength: 1,
      maxLength: 3,
    }),
  )
);
const e = fc.uint8Array({ minLength: 16, maxLength: 16 });
const a = fc.uint8Array({ minLength: 16, maxLength: 16 });
const v = fc.uint8Array({ minLength: 32, maxLength: 32 });
const trible = fc
  .tuple(e, a, v)
  .map((t) => new Uint8Array([...t[0], ...t[1], ...t[2]]));
const tribles = fc.array(trible, { maxLength: 1e5 });

Deno.test("patch insert", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const patch = vs.reduce((patch, v) => patch.put(v), emptyValuePATCH);

      const jsSet = new Set(vs.map((t) => encode(t)));
      const patchSet = new Set([...patch.keys()].map((t) => encode(t)));

      assertEquals(patchSet, jsSet);
    }),
  );
});

Deno.test("patch batch insert", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const patch = vs
        .reduce((patch, v) => patch.put(v), emptyValuePATCH.batch())
        .complete();

      const jsSet = new Set(vs.map((t) => encode(t)));
      const patchSet = new Set([...patch.keys()].map((t) => encode(t)));

      assertEquals(patchSet, jsSet);
    }),
  );
});

Deno.test("patch multi batch insert", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, values, values, (vsA, vsB, vsC) => {
      const patchA = vsA
        .reduce((patch, v) => patch.put(v), emptyValuePATCH.batch())
        .complete();

      const patchB = vsB
        .reduce((patch, v) => patch.put(v), patchA.batch())
        .complete();

      const patchC = vsC
        .reduce((patch, v) => patch.put(v), patchA.batch())
        .complete();

      const jsSet = new Set([
        ...vsA.map((t) => encode(t)),
        ...vsC.map((t) => encode(t)),
      ]);
      const patchSet = new Set([...patchC.keys()].map((t) => encode(t)));

      assertEquals(patchSet, jsSet);
    }),
  );
});

const isSetsEqual = (a, b) =>
  a.size === b.size && [...a].every((value) => b.has(value));

Deno.test("equality check", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.shuffledSubarray(vs), fc.shuffledSubarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const patchA = vsA.reduce((patch, v) => patch.put(v), emptyValuePATCH);
      const patchB = vsB.reduce((patch, v) => patch.put(v), emptyValuePATCH);

      assertEquals(
        patchA.isEqual(patchB),
        isSetsEqual(new Set(vsA), new Set(vsB)),
      );
    }),
  );
});

Deno.test("equality check batched", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.shuffledSubarray(vs), fc.shuffledSubarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const patchA = vsA
        .reduce((patch, v) => patch.put(v), emptyValuePATCH.batch())
        .complete();
      const patchB = vsB
        .reduce((patch, v) => patch.put(v), emptyValuePATCH.batch())
        .complete();

      assertEquals(
        patchA.isEqual(patchB),
        isSetsEqual(new Set(vsA), new Set(vsB)),
      );
    }),
  );
});

Deno.test("shuffled equality check", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.constant(vs), fc.shuffledSubarray(vs, { minLength: vs.length }))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const patchA = vsA.reduce((patch, v) => patch.put(v), emptyValuePATCH);
      const patchB = vsB.reduce((patch, v) => patch.put(v), emptyValuePATCH);

      assertEquals(
        patchA.isEqual(patchB),
        isSetsEqual(new Set(vsA), new Set(vsB)),
      );
    }),
  );
});

Deno.test("shuffled equality check batched", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.constant(vs), fc.shuffledSubarray(vs, { minLength: vs.length }))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const patchA = vsA
        .reduce((patch, v) => patch.put(v), emptyValuePATCH.batch())
        .complete();
      const patchB = vsB
        .reduce((patch, v) => patch.put(v), emptyValuePATCH.batch())
        .complete();

      assertEquals(
        patchA.isEqual(patchB),
        isSetsEqual(new Set(vsA), new Set(vsB)),
      );
    }),
  );
});

Deno.test("segment count", () => {
  const value = fc.uint8Array({ minLength: 32, maxLength: 32 });
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const patch = vs.reduce((patch, v) => patch.put(v), emptyValuePATCH);

      const cursor = patch.cursor();

      assertEquals(cursor.segmentCount(), vs.length);
    }),
  );
});

Deno.test("segment count batched", () => {
  const value = fc.uint8Array({ minLength: 32, maxLength: 32 });
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const patch = vs
        .reduce((patch, v) => patch.put(v), emptyValuePATCH.batch())
        .complete();

      const cursor = patch.cursor();

      assertEquals(cursor.segmentCount(), vs.length);
    }),
  );
});

Deno.test("segment count positive", () => {
  fc.assert(
    fc.property(arb_patch_and_content, ([patch, content]) => {
      const filled_patch = content.flat().reduce((p, k) => p.put(k), patch);

      const work = [filled_patch.child];
      while (work.length > 0) {
        const c = work.shift();
        if (c && c.constructor.name === "PATCHNode") {
          assert(c._segmentCount >= 0);
          if (c.children) work.push(...c.children);
        }
      }
    }),
  );
});

Deno.test("segment count positive batched", () => {
  fc.assert(
    fc.property(arb_patch_and_content, ([patch, content]) => {
      const filled_patch = content.reduce(
        (p1, txn) => txn.reduce((p2, k) => p2.put(k), p1.batch()).complete(),
        patch,
      );

      const work = [filled_patch.child];
      while (work.length > 0) {
        const c = work.shift();
        if (c && c.constructor.name === "PATCHNode") {
          assert(c._segmentCount >= 0);
          if (c.children) work.push(...c.children);
        }
      }
    }),
  );
});

Deno.test("set subtract", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsSetA = new Set(vsA.map((v) => encode(v)));
      const jsSetB = new Set(vsB.map((v) => encode(v)));
      const jsSubtraction = new Set([...jsSetA].filter((x) => !jsSetB.has(x)));

      const patchA = vsA.reduce((patch, v) => patch.put(v), emptyValuePATCH);
      const patchB = vsB.reduce((patch, v) => patch.put(v), emptyValuePATCH);

      const patchSubtraction = patchA.subtract(patchB);
      const patchSubtractionSet = new Set(
        [...patchSubtraction.keys()].map((v) => encode(v)),
      );

      assertEquals(patchSubtraction.count(), jsSubtraction.size);
      assertEquals(patchSubtractionSet, jsSubtraction);
    }),
  );
});

Deno.test("set union", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsUnion = new Set([
        ...vsA.map((v) => encode(v)),
        ...vsB.map((v) => encode(v)),
      ]);

      const patchA = vsA.reduce(
        (patch, trible) => patch.put(trible),
        emptyValuePATCH,
      );
      const patchB = vsB.reduce(
        (patch, trible) => patch.put(trible),
        emptyValuePATCH,
      );
      const patchUnion = patchA.union(patchB);
      const patchUnionSet = new Set([...patchUnion.keys()].map((v) => encode(v)));

      assertEquals(patchUnion.count(), jsUnion.size);
      assertEquals(patchUnionSet, jsUnion);
    }),
  );
});

Deno.test("set intersection", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const rSet = new Set(vsB.map((t) => encode(t)));
      const jsIntersection = new Set(
        vsA.map((v) => encode(v)).filter((v) => rSet.has(v)),
      );

      const patchA = vsA.reduce((patch, v) => patch.put(v), emptyValuePATCH);
      const patchB = vsB.reduce((patch, v) => patch.put(v), emptyValuePATCH);

      const patchIntersection = patchA.intersect(patchB);
      const patchIntersectionSet = new Set(
        [...patchIntersection.keys()].map((v) => encode(v)),
      );

      assertEquals(patchIntersection.count(), jsIntersection.size);
      assertEquals(patchIntersectionSet, jsIntersection);
    }),
  );
});

Deno.test("set symmetric difference", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsSetA = new Set(vsA.map((t) => encode(t)));
      const jsSetB = new Set(vsB.map((t) => encode(t)));
      const jsDifference = new Set([
        ...[...jsSetA].filter((v) => !jsSetB.has(v)),
        ...[...jsSetB].filter((v) => !jsSetA.has(v)),
      ]);

      const patchA = vsA.reduce((patch, v) => patch.put(v), emptyValuePATCH);
      const patchB = vsB.reduce((patch, v) => patch.put(v), emptyValuePATCH);

      const patchDifference = patchA.difference(patchB);
      const patchDifferenceSet = new Set(
        [...patchDifference.keys()].map((v) => encode(v)),
      );

      assertEquals(patchDifference.count(), jsDifference.size);
      assertEquals(patchDifferenceSet, jsDifference);
    }),
  );
});

Deno.test("set isSubsetOf", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsSetA = new Set(vsA.map((t) => encode(t)));
      const jsSetB = new Set(vsB.map((t) => encode(t)));
      const jsIsSubsetOf = [...jsSetA].every((v) => jsSetB.has(v));

      const patchA = vsA.reduce((patch, v) => patch.put(v), emptyValuePATCH);
      const patchB = vsB.reduce((patch, v) => patch.put(v), emptyValuePATCH);

      const patchIsSubsetOf = patchA.isSubsetOf(patchB);

      assertEquals(patchIsSubsetOf, jsIsSubsetOf);
    }),
  );
});

Deno.test("set isIntersecting", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsSetA = new Set(vsA.map((t) => encode(t)));
      const jsSetB = new Set(vsB.map((t) => encode(t)));
      const jsIsIntersecting = [...jsSetA].some((v) => jsSetB.has(v));

      const patchA = vsA.reduce((patch, v) => patch.put(v), emptyValuePATCH);
      const patchB = vsB.reduce((patch, v) => patch.put(v), emptyValuePATCH);

      const patchIsIntersecting = patchA.isIntersecting(patchB);

      assertEquals(patchIsIntersecting, jsIsIntersecting);
    }),
  );
});

Deno.test("static shuffled equality check batched", () => {
  // deno-fmt-ignore
  const [vsA, vsB] = [
    [
      Uint8Array.from([
        248, 137, 105, 1, 124, 164, 154, 1, 184, 214, 252, 238, 92, 193, 119,
        169, 161, 182, 102, 107, 85, 223, 144, 167, 184, 200, 255, 178, 82, 36,
        1, 231,
      ]),
      Uint8Array.from([
        248, 3, 92, 5, 9, 2, 0, 98, 1, 88, 5, 203, 4, 3, 4, 52, 254, 28, 53, 64,
        255, 0, 4, 1, 38, 53, 114, 180, 7, 97, 249, 239,
      ]),
      Uint8Array.from([
        248, 18, 144, 26, 136, 240, 17, 170, 110, 228, 238, 64, 180, 22, 176,
        82, 88, 71, 196, 152, 250, 29, 44, 201, 70, 189, 206, 150, 219, 249, 7,
        195,
      ]),
      Uint8Array.from([
        0, 206, 0, 165, 9, 213, 56, 87, 126, 7, 150, 197, 146, 167, 42, 220,
        188, 88, 91, 80, 73, 135, 197, 58, 59, 211, 66, 229, 125, 241, 27, 184,
      ]),
    ],
    [
      Uint8Array.from([
        0, 206, 0, 165, 9, 213, 56, 87, 126, 7, 150, 197, 146, 167, 42, 220,
        188, 88, 91, 80, 73, 135, 197, 58, 59, 211, 66, 229, 125, 241, 27, 184,
      ]),
      Uint8Array.from([
        248, 137, 105, 1, 124, 164, 154, 1, 184, 214, 252, 238, 92, 193, 119,
        169, 161, 182, 102, 107, 85, 223, 144, 167, 184, 200, 255, 178, 82, 36,
        1, 231,
      ]),
      Uint8Array.from([
        248, 18, 144, 26, 136, 240, 17, 170, 110, 228, 238, 64, 180, 22, 176,
        82, 88, 71, 196, 152, 250, 29, 44, 201, 70, 189, 206, 150, 219, 249, 7,
        195,
      ]),
      Uint8Array.from([
        248, 3, 92, 5, 9, 2, 0, 98, 1, 88, 5, 203, 4, 3, 4, 52, 254, 28, 53, 64,
        255, 0, 4, 1, 38, 53, 114, 180, 7, 97, 249, 239,
      ]),
    ],
  ];

  const patchA = vsA
    .reduce((patch, v) => patch.put(v), emptyValuePATCH.batch())
    .complete();
  const patchB = vsB
    .reduce((patch, v) => patch.put(v), emptyValuePATCH.batch())
    .complete();

  assertEquals(
    patchA.isEqual(patchB),
    isSetsEqual(
      new Set(vsA.map((v) => v.toString())),
      new Set(vsB.map((v) => v.toString())),
    ),
  );
});
