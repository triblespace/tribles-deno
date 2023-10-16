import { schemas } from "./schemas.ts";
import { UFOID } from "./schemas/ufoid.ts";
import { id } from "./namespace.ts";
import { TRIBLE_SIZE, equalValue } from "./trible.ts";
import { blake3 } from "./wasm.js";
import { NS } from "./namespace.ts";
import { FixedUint8Array } from "./util.ts";
import { KB } from "./kb.ts";
import { find } from "./query.ts";

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

const BLAKE3_VERIFICATION = UFOID.now();
const verificationMethodId = UFOID.now();

const commitNS = new NS({
  [id]: schemas.ufoid,
  verificationMethod: { id: verificationMethodId, schema: schemas.ufoid },
  group: { id: commitGroupId, schema: schemas.ufoid },
  segment: { id: commitSegmentId, schema: schemas.subrange },
  createdAt: { id: creationStampId, schema: schemas.geostamp },
  shortMessage: { id: shortMessageId, schema: schemas.shortstring },
  message: { id: messageId, schema: schemas.longstring },
  authoredBy: { id: authoredById, isLink: true },
});

const CAPSTONE_SIZE = 64;

function* splitTribles(bytes: Uint8Array) {
  for (let t = 0; t < bytes.length; t += TRIBLE_SIZE) {
    yield bytes.subarray(t, t + TRIBLE_SIZE);
  }
}

export class Commit {
  metaId: FixedUint8Array<16>;
  kb: KB;

  constructor(kb: KB, metaId = UFOID.now().toId()) {
    this.metaId = metaId;
    this.kb = kb;
  }

  static deserialize(kb: KB, bytes: Uint8Array) {
    if (bytes.length % 64 !== 0) {
      throw Error("failed to deserialize: data size be multiple of 64");
    }

    const payload = bytes.subarray(0, bytes.length - CAPSTONE_SIZE);
    const capstone = bytes.subarray(bytes.length - CAPSTONE_SIZE);

    if (!capstone.subarray(16, 32).every((byte) => byte === 0)) {
      throw Error("failed to deserialize: missing capstone marker");
    }

    const dataset = kb.empty();
    dataset.tribleset = dataset.tribleset.with(
      splitTribles(payload),
    );

    const metaId = new UFOID(capstone.slice(0, 16) as FixedUint8Array<16>);

    const [{ verificationMethod }] = find((ctx, {verificationMethod}) =>
      commitNS.pattern(ctx, kb,
        {[id]: metaId,
        verificationMethod}));
    if (!verificationMethod) {
      throw Error("failed to deserialize: no verification method specified");
    }

    let verifier;
    if (verificationMethod.to_hex() === BLAKE3_VERIFICATION) {
      verifier = blake3;
    } else {
      throw Error("failed to deserialize: unsupported verification method");
    }

    if (
      !equalValue(
        capstone.subarray(32, 64),
        verifier(bytes.subarray(bytes.length - 48)),
      )
    ) {
      throw Error("failed to deserialize: verification failed");
    }

    return new Commit(dataset, metaId.toId());
  }

  serialize() {
    let verifier;

    const { verificationMethod } = commitNS.walk(this.kb, this.metaId);
    if (!verificationMethod) {
      throw Error("failed to serialize: no verification method specified");
    }
    if (verificationMethod.to_hex() === BLAKE3_VERIFICATION) {
      verifier = blake3;
    } else {
      throw Error("failed to serialize: unsupported verification method");
    }

    const tribles_count = this.kb.tribleset.count();
    const tribles = this.kb.tribleset.tribles();

    let buffer = new Uint8Array((tribles_count * TRIBLE_SIZE) + CAPSTONE_SIZE);

    let offset = 0;
    for (const trible of tribles) {
      buffer.set(trible, offset);
      offset += TRIBLE_SIZE;
    }

    buffer.subarray(offset, offset + 16).set(this.metaId);

    buffer.subarray(offset + 32, offset + 64).set(
      verifier(buffer.subarray(0, offset + 16)),
    );

    return buffer;
  }
}

const udp_max_commit_size = 1021;

export function validateCommitSize(
  max_trible_count = udp_max_commit_size,
  middleware = (commit: Commit): Commit[] => [commit],
) {
  return async function* (commit: Commit) {
    for await (const c of middleware(commit)) {
      if (c.kb.tribleset.count() > max_trible_count) {
        throw Error(
          `Commit too large: Commits must not contain more than ${max_trible_count} tribles.`,
        );
      }
      yield commit;
    }
  };
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
