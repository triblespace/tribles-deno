import { types } from "./types.js";
import { UFOID } from "./types/ufoid.js";
import { id } from "./namespace.js";

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
