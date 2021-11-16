import {
  assert,
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import fc from "https://cdn.skypack.dev/fast-check";

/*
fc.configureGlobal({
  numRuns: Number.MAX_SAFE_INTEGER,
  interruptAfterTimeLimit: 1000 * 300,
});
*/

import {
  decode,
  encode,
} from "https://deno.land/std@0.78.0/encoding/base64.ts";

import { equal, equalValue } from "../src/js/trible.js";
import { makePACT, emptyTriblePACT, emptyValuePACT } from "../src/js/pact.js";

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
      })
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

const arb_pact_and_content = arb_segment_sizes.chain((segments) =>
  fc.tuple(
    fc.constant(makePACT(segments)),
    fc.array(arb_segmented_keys(segments), {
      minLength: 1,
      maxLength: 3,
    })
  )
);
const e = fc.uint8Array({ minLength: 16, maxLength: 16 });
const a = fc.uint8Array({ minLength: 16, maxLength: 16 });
const v = fc.uint8Array({ minLength: 32, maxLength: 32 });
const trible = fc
  .tuple(e, a, v)
  .map((t) => new Uint8Array([...t[0], ...t[1], ...t[2]]));
const tribles = fc.array(trible, { maxLength: 1e5 });

Deno.test("pact insert", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const pact = vs.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const jsSet = new Set(vs.map((t) => encode(t)));
      const pactSet = new Set([...pact.keys()].map((t) => encode(t)));

      assertEquals(pactSet, jsSet);
    }),
    { seed: -1017857781, path: "0:1:0:0:0:0:0:0:0:0:1:2", endOnFailure: true }
  );
});

Deno.test("pact batch insert", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const pact = vs
        .reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();

      const jsSet = new Set(vs.map((t) => encode(t)));
      const pactSet = new Set([...pact.keys()].map((t) => encode(t)));

      assertEquals(pactSet, jsSet);
    })
  );
});

Deno.test("pact multi batch insert", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 32, maxLength: 32 })
    .map((a) => new Uint8Array(a));
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, values, values, (vsA, vsB, vsC) => {
      const pactA = vsA
        .reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();

      const pactB = vsB
        .reduce((pact, v) => pact.put(v), pactA.batch())
        .complete();

      const pactC = vsC
        .reduce((pact, v) => pact.put(v), pactA.batch())
        .complete();

      const jsSet = new Set([
        ...vsA.map((t) => encode(t)),
        ...vsC.map((t) => encode(t)),
      ]);
      const pactSet = new Set([...pactC.keys()].map((t) => encode(t)));

      assertEquals(pactSet, jsSet);
    })
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
      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      assertEquals(
        pactA.isEqual(pactB),
        isSetsEqual(new Set(vsA), new Set(vsB))
      );
    })
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
      const pactA = vsA
        .reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();
      const pactB = vsB
        .reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();

      assertEquals(
        pactA.isEqual(pactB),
        isSetsEqual(new Set(vsA), new Set(vsB))
      );
    })
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
      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      assertEquals(
        pactA.isEqual(pactB),
        isSetsEqual(new Set(vsA), new Set(vsB))
      );
    })
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
      const pactA = vsA
        .reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();
      const pactB = vsB
        .reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();

      assertEquals(
        pactA.isEqual(pactB),
        isSetsEqual(new Set(vsA), new Set(vsB))
      );
    })
  );
});

Deno.test("segment count", () => {
  const value = fc.uint8Array({ minLength: 32, maxLength: 32 });
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const pact = vs.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const cursor = pact.cursor();

      assertEquals(cursor.segmentCount(), vs.length);
    })
  );
});

Deno.test("segment count batched", () => {
  const value = fc.uint8Array({ minLength: 32, maxLength: 32 });
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const pact = vs
        .reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();

      const cursor = pact.cursor();

      assertEquals(cursor.segmentCount(), vs.length);
    })
  );
});

Deno.test("segment count positive", () => {
  fc.assert(
    fc.property(arb_pact_and_content, ([pact, content]) => {
      const filled_pact = content.flat().reduce((p, k) => p.put(k), pact);

      const work = [filled_pact.child];
      while (work.length > 0) {
        const c = work.shift();
        if (c && c.constructor.name === "PACTNode") {
          assert(c._segmentCount >= 0);
          if (c.children) work.push(...c.children);
        }
      }
    })
  );
});

Deno.test("segment count positive batched", () => {
  fc.assert(
    fc.property(arb_pact_and_content, ([pact, content]) => {
      const filled_pact = content.reduce(
        (p1, txn) => txn.reduce((p2, k) => p2.put(k), p1.batch()).complete(),
        pact
      );

      const work = [filled_pact.child];
      while (work.length > 0) {
        const c = work.shift();
        if (c && c.constructor.name === "PACTNode") {
          assert(c._segmentCount >= 0);
          if (c.children) work.push(...c.children);
        }
      }
    })
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
      const jsDifference = new Set([...jsSetA].filter((x) => !jsSetB.has(x)));

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      debugger;

      const rawPactDifference = [...pactA.subtract(pactB).keys()];
      const pactDifference = new Set(rawPactDifference.map((v) => encode(v)));

      assertEquals(rawPactDifference.length, jsDifference.size);
      assertEquals(pactDifference, jsDifference);
    })
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

      const pactA = vsA.reduce(
        (pact, trible) => pact.put(trible),
        emptyValuePACT
      );
      const pactB = vsB.reduce(
        (pact, trible) => pact.put(trible),
        emptyValuePACT
      );
      const rawPactUnion = [...pactA.union(pactB).keys()];
      const pactUnion = new Set(rawPactUnion.map((v) => encode(v)));

      assertEquals(rawPactUnion.length, jsUnion.size);
      assertEquals(pactUnion, jsUnion);
    })
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
        vsA.map((v) => encode(v)).filter((v) => rSet.has(v))
      );

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const rawPactIntersection = [...pactA.intersect(pactB).keys()];
      const pactIntersection = new Set(
        rawPactIntersection.map((v) => encode(v))
      );

      assertEquals(rawPactIntersection.length, jsIntersection.size);
      assertEquals(pactIntersection, jsIntersection);
    })
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

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const rawPactDifference = [...pactA.difference(pactB).keys()];
      const pactDifference = new Set(rawPactDifference.map((v) => encode(v)));

      assertEquals(rawPactDifference.length, jsDifference.size);
      assertEquals(pactDifference, jsDifference);
    }),
    {
      seed: 904358189,
      path: "23:7:2:19:29:39:49:59:69:79:89:99:109:119:129:139:149:159:169:178:187:196:205:206:195:203:211:219:227:235:243:251:259:267:275:283:291:299:307:315:323:331:339:347:355:363:371:379:387:395:403:411:419:427:435:443:451:459:467:475:483:491:499:507:515:523:531:539:547:563:571:579:587:595:603:611:619:627:635:643:651:659:667:675:683:691:699:707:715:723:731:739:747:755:763:771:779:787:795:803:811:819:827:835:843:851:859:867:875:883:891:899:907:915:923:931:939:955:963:971:979:987:995:1003:1011:1019:1027:1035:1043:1051:1059:1067:1075:1083:1091:1099:1107:1115:1123:1131:1139:1147:1171:1179:1187:1195:1203:1211:1218:1225:1232:1239:1246:1253:1260:1267:1274:1281:1288:1295:1302:1309:1316:1323:1330:1337:1344:1351:1358:1365:1372:1379:1386:1393:1400:1407:1414:1421:1428:1435:1442:1449:1456:1463:1470:1477:1484:1491:1498:1505:1512:1519:1526:1533:1540:1547:1554:1561:1568:1575:1582:1589:1596:1603:1610:1617:1624:1631:1638:1645:1652:1659:1665:1671:1683:1689:1695:1701:1707:1713:1719:1725:1731:1751:1757:1763:1769:1775:1781:1787:1793:1799:1805:1811:1817:1823:1829:1835:1841:1847:1853:1859:1860:1131:1684:1788:1792:1796:1800:1804:1808:1812:1816:1820:1823:1826:1829:1832:1834:1836:1837:1838:3:4:3:3:3:5",
      endOnFailure: true,
    }
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

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const pactIsSubsetOf = pactA.isSubsetOf(pactB);

      assertEquals(pactIsSubsetOf, jsIsSubsetOf);
    })
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

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const pactIsIntersecting = pactA.isIntersecting(pactB);

      assertEquals(pactIsIntersecting, jsIsIntersecting);
    })
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

  debugger;
  const pactA = vsA
    .reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
    .complete();
  const pactB = vsB
    .reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
    .complete();

  assertEquals(
    pactA.isEqual(pactB),
    isSetsEqual(
      new Set(vsA.map((v) => v.toString())),
      new Set(vsB.map((v) => v.toString()))
    )
  );
});
