import { schemas } from "./schemas.ts";
import { UFOID } from "./schemas/ufoid.ts";
import { id } from "./namespace.ts";
import { equalValue, Trible, TRIBLE_SIZE, Value } from "./trible.ts";
import { blake3 } from "./wasm.js";
import { NS } from "./namespace.ts";
import { FixedUint8Array } from "./util.ts";
import { KB } from "./kb.ts";
import { find, Variable } from "./query.ts";

//
// The payload consists of both the data and metadata trible
// sorted in canonical EAV order.
//
// Each commits ends with a zero attribute marked capstone trible for framing.
//
//   Note that the use of nil/zero ids is invalid in tribles, which allows
//   us to use it in this fashion without data transparency issues.
//
// This is followed by a 32 byte checksum, the verification algorithm of
// which is stored as part of the commit data.
//
// The following commit id identifies an entity in the commit itself that
// contains metadata about this commit, such as the checksum algorithm,
// creation time, additional information on provenance and the author,
// and wether this commit is part of a larger unit of information.
//
//
//                              64 byte
//                                 │
// ┌──────────────────────────────────────────────────────────────┐
// ┌──────────────┬┬──────────────┬┬──────────────────────────────┐+
// │    entity    ││  attribute   ││            value             │
// └──────────────┴┴──────────────┴┴──────────────────────────────┘
//                                 │
//                              trible
//
//      16 byte         16 byte                 32 byte
//         │               │                       │
// ┌──────────────┐┌──────────────┐┌──────────────────────────────┐
// ┌──────────────┐┌──────────────┐┌──────────────────────────────┐
// │  commit id   ││     zero     ││           checksum           │
// └──────────────┘└──────────────┘└──────────────────────────────┘
//                                 │
//                              capstone
//

const commitGroupId = UFOID.now();
const commitSegmentId = UFOID.now();
const creationStampId = UFOID.now();
const shortMessageId = UFOID.now();
const messageId = UFOID.now();
const authoredById = UFOID.now();

const BLAKE3_VERIFICATION = UFOID.now().toHex();
const verificationMethodId = UFOID.now();

const commitNS = new NS(
  schemas.ufoid,
  {
    verificationMethod: { id: verificationMethodId, schema: schemas.ufoid },
    group: { id: commitGroupId, schema: schemas.ufoid },
    segment: { id: commitSegmentId, schema: schemas.subrange },
    createdAt: { id: creationStampId, schema: schemas.geostamp },
    shortMessage: { id: shortMessageId, schema: schemas.shortstring },
    message: { id: messageId, schema: schemas.longstring },
    authoredBy: { id: authoredById, schema: schemas.ufoid },
  } as const,
);

const CAPSTONE_SIZE = 64;

function* splitTribles(bytes: Uint8Array) {
  for (let t = 0; t < bytes.length; t += TRIBLE_SIZE) {
    yield bytes.subarray(t, t + TRIBLE_SIZE) as Trible;
  }
}

export class Commit {
  metaId: UFOID;
  kb: KB;

  constructor(kb: KB, metaId = UFOID.now()) {
    this.metaId = metaId;
    this.kb = kb;
  }

  static deserialize(bytes: Uint8Array) {
    if (bytes.length % 64 !== 0) {
      throw Error("failed to deserialize: data size be multiple of 64");
    }

    const payload = bytes.subarray(0, bytes.length - CAPSTONE_SIZE);
    const capstone = bytes.subarray(bytes.length - CAPSTONE_SIZE);

    if (!capstone.subarray(16, 32).every((byte) => byte === 0)) {
      throw Error("failed to deserialize: missing capstone marker");
    }

    const kb = new KB();
    kb.tribleset = kb.tribleset.with(
      splitTribles(payload),
    );

    const metaId = new UFOID(capstone.slice(0, 16) as FixedUint8Array<16>);

    const [{ verificationMethod }] = find((
      ctx,
      { verificationMethod }: { verificationMethod: Variable<UFOID> },
    ) =>
      commitNS.pattern(ctx, kb, [{
        [id]: metaId,
        verificationMethod: verificationMethod,
      }])
    );
    if (!verificationMethod) {
      throw Error("failed to deserialize: no verification method specified");
    }

    let verifier: ((payload: Uint8Array) => Value) | undefined;
    if (verificationMethod.toHex() === BLAKE3_VERIFICATION) {
      verifier = blake3 as (payload: Uint8Array) => Value;
    } else {
      throw Error("failed to deserialize: unsupported verification method");
    }

    if (
      !equalValue(
        capstone.subarray(32, 64) as Value,
        verifier(bytes.subarray(0, bytes.length - 48)),
      )
    ) {
      throw Error("failed to deserialize: verification failed");
    }

    return new Commit(kb, metaId);
  }

  serialize() {
    let verifier;

    const [{ verificationMethod }] = find((
      ctx,
      { verificationMethod }: { verificationMethod: Variable<UFOID> },
    ) =>
      commitNS.pattern(ctx, this.kb, [{
        [id]: this.metaId,
        verificationMethod: verificationMethod,
      }])
    );
    if (!verificationMethod) {
      throw Error("failed to serialize: no verification method specified");
    }
    if (verificationMethod.toHex() === BLAKE3_VERIFICATION) {
      verifier = blake3;
    } else {
      throw Error("failed to serialize: unsupported verification method");
    }

    const tribles_count = this.kb.tribleset.count();
    const tribles = this.kb.tribleset.tribles();

    const buffer = new Uint8Array(
      (tribles_count * TRIBLE_SIZE) + CAPSTONE_SIZE,
    );

    let offset = 0;
    for (const trible of tribles) {
      buffer.set(trible, offset);
      offset += TRIBLE_SIZE;
    }

    buffer.subarray(offset, offset + 16).set(this.metaId.toId());

    buffer.subarray(offset + 32, offset + 64).set(
      verifier(buffer.subarray(0, offset + 16)),
    );

    return buffer;
  }
}

const udp_max_commit_size = 65535;

export function validateCommitSize(
  max_bytes = udp_max_commit_size,
  commit: Commit,
) {
  if ((commit.kb.tribleset.count() * TRIBLE_SIZE + CAPSTONE_SIZE) > max_bytes) {
    throw Error(
      `Commit too large: Commit must not be larger than ${max_bytes} bytes.`,
    );
  }
  return commit;
}

// TODO:
// export function autoSplitCommitGroup(groupCommitFn) {
//   (kb, commitId) => {
//   return kb.with(commitNS, () => [{
//     [id]: commitFragmentId,
//     group: commitId,
//     subrange: {range_start: 0,
//                range_end: data_tribles_count,
//                start: trible_offset},
//     createdAt: geostamp.stamp(),
//   }]);
//   }
// }
