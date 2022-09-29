import { TribleSet } from "./tribleset.js";
import { TRIBLE_SIZE } from "./trible.js";
import { KB } from "./kb.js";
import { types } from "./types.js";
import { TribleSet } from "./tribleset.js";
import { BlobCache } from "./blobcache.js";
import { UFOID } from "./types/ufoid.js";
import { commit_verify } from "./wasm.js";
import { id, buildNamespace } from "./namespace.js";
import { keychain, authNS } from "./auth.js";

// Each commits starts with a 16 byte zero marker for framing.
//
//   Note that the use of nil/zero ids is invalid in tribles, which allows
//   us to use it in this fashion without data transparency issues.
// 
// This is followed by a blaked25519 plublic key used to sign the commit
// and the corresponding signature.
//
// The following commit id identifies an entity in the commit itself that
// contains metadata about this commit, such as creation time, additional
// information on provenance and the author, and wether this commit is
// part of a larger unit of information.
//
//   The reason for the signature awkwardly crossing cache lines,
//   with the commit id following it is that this allows implementations
//   to conveniently sign the both the commit id and the payload without
//   having to copy them into a contiguous buffer.
//
// The following payload consists of both the data and metadata trible
// sorted in canonical EAV order.
//
//      16 byte                 32 byte
//         │                       │
// ┌──────────────┐┌──────────────────────────────┐
// ┌──────────────┐┌──────────────────────────────┐┌──────────────┐
// │     zero     ││          public key          ││  signature   │
// └──────────────┘└──────────────────────────────┘└──────────────┘
//                                                 └──────────────┘
//                         ┌───────────────────────────────┘
//                      64 byte                         16 byte
//                         │                               │
// ┌──────────────────────────────────────────────┐┌──────────────┐
// ┌──────────────────────────────────────────────┐┌──────────────┐
// │                  signature                   ││  commit id   │
// └──────────────────────────────────────────────┘└──────────────┘
//
//                              64 byte
//                                 │
// ┌──────────────────────────────────────────────────────────────┐
// ┌──────────────┬┬──────────────┬┬──────────────────────────────┐*
// │    entity    ││  attribute   ││            value             │
// └──────────────┴┴──────────────┴┴──────────────────────────────┘
//                                 │
//                              trible

const commit_header_size = 128;
const commit_max_trible_count = 1020;


export function validateCommitSize(max_trible_count = commit_max_trible_count) {
  return (commit) => {
    if(commit.commitKB.count() > max_trible_count) throw Error(
      `Commit too large: Commits must not contain more than ${max_trible_count} tribles.`
    );
  }
}

const { commitGroupId, commitSegmentId, creationStampId, shortMessageId, messageId, authorId, signatureId } =
  UFOID.namedCache();

const commitNS = {
  [id]: { ...types.ufoid },
  group: { id: commitGroupId, ...types.ufoid },
  segment: { id: commitSegmentId, ...types.subrange },
  createdAt: { id: creationStampId, ...types.geostamp },
  shortMessage: { id: shortMessageId, ...types.shortstring },
  message: { id: messageId, ...types.longstring }
};

const metaNS = {...commitNS, ...authNS};

export function withCommitMeta(kb, commitId, pubkey) {
  return kb.with(metaNS, () => [{
          [id]: commitId,
          createdAt: geostamp.stamp(),
          pubkey,
        }]);
}

// TODO commit splitting for when you just want a helper to dump stuff
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

// const TRIBLE_SIZE_IN_UINT32 = TRIBLE_SIZE / Uint32Array.BYTES_PER_ELEMENT;
// function recoverFromBrokenCommit(bytes) {
//   const view = new Uint32Array(bytes.buffer, bytes.byteOffset);

//   for (let i = 0; i < view.length - 4; i = i + TRIBLE_SIZE_IN_UINT32) {
//     if (
//       view[i] === 0 &&
//       view[i + 1] === 0 &&
//       view[i + 2] === 0 &&
//       view[i + 3] === 0
//     ) {
//       return bytes.subarray(i * Uint32Array.BYTES_PER_ELEMENT);
//     }
//   }
// }

function* splitTribles(bytes) {
  for (let t = 0; t < bytes.length; t += TRIBLE_SIZE) {
    yield bytes.subarray(t, t + TRIBLE_SIZE);
  }
}

export class NoveltyConstraint {
  constructor(baseKB, currentKB, triples) {

  }
}

export class Commit {
  constructor(baseKB, commitKB, currentKB, commitId) {
    this.baseKB = baseKB;
    this.currentKB = currentKB;
    this.commitKB = commitKB;
    this.commitId = commitId;
  }

  static deserialize(baseKB, bytes) {
    if(!wasm.commit_verify(bytes)) {
      throw Error("Failed to verify commit!");
    }
    const commitId = bytes.slice(112, 128);

    const commitKB = baseKB.empty().withTribles(splitTribles(bytes.subarray(commit_header_size)));
    const currentKB = baseKB.union(commitKB);

    //TODO check that commitID author = pubkey

    return new Commit(baseKB, commitKB, currentKB, commitId);
  }

  serialize() {
    const [{pubkey}, second] = find(({ pubkey }) => [
      this.commitKB.where(metaNS, [{
          [id]: this.commitId,
          pubkey,
        }])]);

    if(second) {
      throw Error("Ambiguous public key for commit!");
    }

    const [{secretkey}] = find(({ secretkey }) => [
      keychain.where(metaNS, [{
          pubkey,
          secretkey}])]);

    if(!secretkey) {
      throw Error("Missing secret key in keychain!");
    }

    const tribles_count = this.commitKB.tribleset.count();
    const tribles = this.commitKB.tribleset.tribles();
    
    let i = 0;
    for (const trible of tribles) { 
      wasm._global_commit_buffer_tribles.subarray(i * TRIBLE_SIZE, (i + 1) * TRIBLE_SIZE).set(trible);
      i += 1;
    }
    return wasm.commit_sign(secretkey, tribles_count);
  }

  where(ns, entities) {
    const build_ns = buildNamespace(ns);
    return (vars) => {
      const triples = entitiesToTriples(build_ns, () => vars.unnamed(), entities);
      const triplesWithVars = precompileTriples(build_ns, vars, triples);

      triplesWithVars.foreach(([e, a, v]) => {
        v.proposeBlobDB(currentKB.blobdb);
      });
      return [
        ...triplesWithVars.map(([e, a, v]) =>
          currentKB.tribleset.constraint(e.index, a.index, v.index)
        ),
        //new NoveltyConstraint(this.baseKB, this.currentKB, triplesWithVars),
      ];
    };
  }
}
