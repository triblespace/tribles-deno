import { types } from "./types.ts";
import { UFOID } from "./types/ufoid.ts";
import { id } from "./namespace.ts";
import { TRIBLE_SIZE } from "./trible.ts";
import { blake3 } from "./wasm.js";
import { NS } from "./namespace.ts";
import { UFOID } from "./types/ufoid.ts";

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

const commitNS = new NS({
  [id]: { ...types.ufoid },
  verificationMethod: { id: verificationMethodId, ...types.ufoid },
  group: { id: commitGroupId, ...types.ufoid },
  segment: { id: commitSegmentId, ...types.subrange },
  createdAt: { id: creationStampId, ...types.geostamp },
  shortMessage: { id: shortMessageId, ...types.shortstring },
  message: { id: messageId, ...types.longstring },
  authoredBy: { id: authoredById, isLink: true },
});

const BLAKE3_VERIFICATION = UFOID.now();
const verificationMethodId = UFOID.now();

const CAPSTONE_SIZE = 64;

function* splitTribles(bytes) {
  for (let t = 0; t < bytes.length; t += TRIBLE_SIZE) {
    yield bytes.subarray(t, t + TRIBLE_SIZE);
  }
}

export class Commit {
  constructor(kb, metaId = UFOID.now()) {
    this.metaId = metaId;
    this.kb = kb;
  }

  static deserialize(kb, bytes) {
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

    const metaId = new UFOID(capstone.slice(0, 16));

    let { verificationMethod } = commitNS.walk(kb, metaId);
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

    return new Commit(metaId, dataset);
  }

  serialize() {
    let verifier;

    let { verificationMethod } = commitNS.walk(this.kb, this.metaId);
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
  middleware = (commit) => [commit],
) {
  return async function* (commit) {
    for await (const commit of middleware(commit)) {
      if (commit.commitKB.tribleset.count() > max_trible_count) {
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
