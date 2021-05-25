import {
  assert,
  assertArrayIncludes,
  assertEquals,
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
import { emptyTriblePACT, emptyValuePACT } from "../src/pact.js";

Deno.test("pact insert", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const pact = vs.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const jsSet = new Set(vs.map((t) => encode(t)));
      const pactSet = new Set([...pact.keys()].map((t) => encode(t)));

      assertEquals(pactSet, jsSet);
    }),
  );
});

Deno.test("pact batch insert", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const pact = vs.reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();

      const jsSet = new Set(vs.map((t) => encode(t)));
      const pactSet = new Set([...pact.keys()].map((t) => encode(t)));

      assertEquals(pactSet, jsSet);
    }),
  );
});

Deno.test("pact multi batch insert", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, values, values, (vsA, vsB, vsC) => {
      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();

      const pactB = vsB.reduce((pact, v) => pact.put(v), pactA.batch())
        .complete();

      const pactC = vsC.reduce((pact, v) => pact.put(v), pactA.batch())
        .complete();

      const jsSet = new Set([
        ...vsA.map((t) => encode(t)),
        ...vsC.map((t) => encode(t)),
      ]);
      const pactSet = new Set([...pactC.keys()].map((t) => encode(t)));

      assertEquals(pactSet, jsSet);
    }),
  );
});

const isSetsEqual = (a, b) =>
  a.size === b.size && [...a].every((value) => b.has(value));

Deno.test("equality check", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.shuffledSubarray(vs), fc.shuffledSubarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      assertEquals(
        pactA.isEqual(pactB),
        isSetsEqual(new Set(vsA), new Set(vsB)),
      );
    }),
  );
});

Deno.test("equality check batched", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.shuffledSubarray(vs), fc.shuffledSubarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();

      assertEquals(
        pactA.isEqual(pactB),
        isSetsEqual(new Set(vsA), new Set(vsB)),
      );
    }),
  );
});

Deno.test("shuffled equality check", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.constant(vs), fc.shuffledSubarray(vs, { minLength: vs.length }))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      assertEquals(
        pactA.isEqual(pactB),
        isSetsEqual(new Set(vsA), new Set(vsB)),
      );
    }),
  );
});

Deno.test("shuffled equality check batched", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.constant(vs), fc.shuffledSubarray(vs, { minLength: vs.length }))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();

      assertEquals(
        pactA.isEqual(pactB),
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
      const pact = vs.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const cursor = pact.segmentCursor().push();

      assertEquals(cursor.segmentCount(), vs.length);
    }),
  );
});

Deno.test("set subtract", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsSetA = new Set(vsA.map((v) => encode(v)));
      const jsSetB = new Set(vsB.map((v) => encode(v)));
      const jsDifference = new Set([...jsSetA].filter((x) => !jsSetB.has(x)));

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const rawPactDifference = [...pactA.subtract(pactB).keys()];
      const pactDifference = new Set(rawPactDifference
        .map((v) => encode(v)));

      assertEquals(rawPactDifference.length, jsDifference.size);
      assertEquals(pactDifference, jsDifference);
    }),
  );
});

Deno.test("set union", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsUnion = new Set(
        [...vsA.map((v) => encode(v)), ...vsB.map((v) => encode(v))],
      );

      const pactA = vsA.reduce(
        (pact, trible) => pact.put(trible),
        emptyValuePACT,
      );
      const pactB = vsB.reduce(
        (pact, trible) => pact.put(trible),
        emptyValuePACT,
      );
      const rawPactUnion = [...pactA.union(pactB).keys()];
      const pactUnion = new Set(rawPactUnion
        .map((v) => encode(v)));

      assertEquals(rawPactUnion.length, jsUnion.size);
      assertEquals(pactUnion, jsUnion);
    }),
  );
});

Deno.test("set intersection", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
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

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const rawPactIntersection = [...pactA.intersect(pactB).keys()];
      const pactIntersection = new Set(rawPactIntersection
        .map((v) => encode(v)));

      assertEquals(rawPactIntersection.length, jsIntersection.size);
      assertEquals(pactIntersection, jsIntersection);
    }),
  );
});

Deno.test("set symmetric difference", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsSetA = new Set(vsA.map((t) => encode(t)));
      const jsSetB = new Set(vsB.map((t) => encode(t)));
      const jsDifference = new Set(
        [
          ...[...jsSetA].filter((v) => !jsSetB.has(v)),
          ...[...jsSetB].filter((v) => !jsSetA.has(v)),
        ],
      );

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const rawPactDifference = [...pactA.difference(pactB).keys()];
      const pactDifference = new Set(rawPactDifference.map((v) => encode(v)));

      assertEquals(rawPactDifference.length, jsDifference.size);
      assertEquals(pactDifference, jsDifference);
    }),
  );
});

Deno.test("set isSubsetOf", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsSetA = new Set(vsA.map((t) => encode(t)));
      const jsSetB = new Set(vsB.map((t) => encode(t)));
      const jsIsSubsetOf = [...jsSetA].every((v) => jsSetB.has(v));

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const pactIsSubsetOf = pactA.isSubsetOf(pactB);

      assertEquals(pactIsSubsetOf, jsIsSubsetOf);
    }),
  );
});

Deno.test("set isIntersecting", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsSetA = new Set(vsA.map((t) => encode(t)));
      const jsSetB = new Set(vsB.map((t) => encode(t)));
      const jsIsIntersecting = [...jsSetA].some((v) => jsSetB.has(v));

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const pactIsIntersecting = pactA.isIntersecting(pactB);

      assertEquals(pactIsIntersecting, jsIsIntersecting);
    }),
  );
});

Deno.test("static shuffled equality check batched", () => {
  // deno-fmt-ignore
  const [vsA, vsB] = [[Uint8Array.from([248,137,105,1,124,164,154,1,184,214,252,238,92,193,119,169,161,182,102,107,85,223,144,167,184,200,255,178,82,36,1,231]),Uint8Array.from([248,3,92,5,9,2,0,98,1,88,5,203,4,3,4,52,254,28,53,64,255,0,4,1,38,53,114,180,7,97,249,239]),Uint8Array.from([248,18,144,26,136,240,17,170,110,228,238,64,180,22,176,82,88,71,196,152,250,29,44,201,70,189,206,150,219,249,7,195]),Uint8Array.from([0,206,0,165,9,213,56,87,126,7,150,197,146,167,42,220,188,88,91,80,73,135,197,58,59,211,66,229,125,241,27,184])],
                      [Uint8Array.from([0,206,0,165,9,213,56,87,126,7,150,197,146,167,42,220,188,88,91,80,73,135,197,58,59,211,66,229,125,241,27,184]),Uint8Array.from([248,137,105,1,124,164,154,1,184,214,252,238,92,193,119,169,161,182,102,107,85,223,144,167,184,200,255,178,82,36,1,231]),Uint8Array.from([248,18,144,26,136,240,17,170,110,228,238,64,180,22,176,82,88,71,196,152,250,29,44,201,70,189,206,150,219,249,7,195]),Uint8Array.from([248,3,92,5,9,2,0,98,1,88,5,203,4,3,4,52,254,28,53,64,255,0,4,1,38,53,114,180,7,97,249,239])]];

  debugger;
  const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
    .complete();
  const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
    .complete();

  assertEquals(
    pactA.isEqual(pactB),
    isSetsEqual(
      new Set(vsA.map((v) => v.toString())),
      new Set(vsB.map((v) => v.toString())),
    ),
  );
});
