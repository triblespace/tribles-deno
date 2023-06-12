import { TRIBLE_SIZE } from "./trible.js";
import { types } from "./types.js";
import { UFOID } from "./types/ufoid.js";
import { id } from "./namespace.js";
import { authNS } from "./auth.js";
import {
  deserialize as tribleDeserialize,
  serialize as tribleSerialize,
} from "./tribleset.js";
import {
  deserialize as blobDeserialize,
  serialize as blobSerialize,
} from "./blobcache.js";

// Each commits starts with a 16 byte zero marker for framing.
//
//   Note that the use of nil/zero ids is invalid in tribles, which allows
//   us to use it in this fashion without data transparency issues.
//
// This is followed by a 32 byte checksum, the verification algorithm of
// which is stored as part of the commit data.
//
// The following commit id identifies an entity in the commit itself that
// contains metadata about this commit, such as the checksum algorithm,
//  creation time, additional information on provenance and the author,
// and wether this commit is part of a larger unit of information.
//
//   The reason for the signature awkwardly crossing cache lines,
//   with the commit id following it is that this allows implementations
//   to conveniently sign the both the commit id and the payload without
//   having to copy them into a contiguous buffer.
//
// The following payload consists of both the data and metadata trible
// sorted in canonical EAV order.
//
//      16 byte                 32 byte                 16 byte
//         │                       │                       │
// ┌──────────────┐┌──────────────────────────────┐┌──────────────┐
// ┌──────────────┐┌──────────────────────────────┐┌──────────────┐
// │     zero     ││           checksum           ││  commit it   │
// └──────────────┘└──────────────────────────────┘└──────────────┘
//
//                              64 byte
//                                 │
// ┌──────────────────────────────────────────────────────────────┐
// ┌──────────────┬┬──────────────┬┬──────────────────────────────┐*
// │    entity    ││  attribute   ││            value             │
// └──────────────┴┴──────────────┴┴──────────────────────────────┘
//                                 │
//                              trible

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


const commitGroupId = UFOID.now();
const commitSegmentId = UFOID.now();
const creationStampId = UFOID.now();
const shortMessageId = UFOID.now();
const messageId = UFOID.now();
const authoredById = UFOID.now();

const commitNS = new NS({
  [id]: { ...types.ufoid },
  group: { id: commitGroupId, ...types.ufoid },
  segment: { id: commitSegmentId, ...types.subrange },
  createdAt: { id: creationStampId, ...types.geostamp },
  shortMessage: { id: shortMessageId, ...types.shortstring },
  message: { id: messageId, ...types.longstring },
  authoredBy: { id: authoredById, isLink: true },
});

export class Commit {
  constructor(commitId, baseKB, commitKB, currentKB) {
    this.commitId = commitId;
    this.baseKB = baseKB;
    this.currentKB = currentKB;
    this.commitKB = commitKB;
  }

  patternConstraint(pattern) {
    for (const [_e, _a, v] of pattern) {
      v.proposeBlobCache(this.blobcache);
    }
    return currentKB.tribleset.patternConstraint(pattern);
    //new NoveltyConstraint(this.baseKB, this.currentKB, triplesWithVars),
  }
}
