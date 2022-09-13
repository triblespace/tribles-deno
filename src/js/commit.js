import * as ed from "https://deno.land/x/ed25519/mod.ts";

import { TribleSet } from "./tribleset.js";
import { TRIBLE_SIZE } from "./trible.js";
import { id, KB, namespace } from "./src/js/kb.js";
import { types } from "./src/js/types.js";
import { TribleSet } from "./src/js/tribleset.js";
import { BlobCache } from "./src/js/blobcache.js";
import { UFOID } from "./src/js/types/ufoid.js";

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

const { commitGroupId, commitSegmentId, creationStampId } =
  UFOID.namedCache();

const commitNS = namespace({
  [id]: { ...types.ufoid },
  group: { id: commitGroupId, ...types.ufoid },
  segment: { id: commitSegmentId, ...types.segment },
  createdAt: { id: creationStampId, ...types.spacetimestamp },
});

export async function serialize(kb, privateKey) {
  // Add some data.
  let metadata = new KB(new TribleSet(), new BlobCache());

  metadata = metadata.with(commitNS, () => [{
          [id]: commitId,
          group: commitGroupId,
          segment: new Segment(segment_count, segment_i),
          createdAt: spacetimestamp.stamp(),
        }]);

  const data_tribles_count = kb.tribleset.count();
  const data_tribles = kb.tribleset.tribles();

  const data = new Uint8Array(commit_header_size + (TRIBLE_SIZE * tribles_count));
  const tribles = data.subarray(MARKER_SIZE);
  for (let i = 0; i < triblesEager.length; i++) { 
    tribles.set(triblesEager[i], i * TRIBLE_SIZE);
  }
  const signature = await ed.sign(tribles, privateKey);
  data.subarray(64, 128).put(signature);

  return data;
}

async function readTxnMarker(bytes) {
  if (bytes.length < MARKER_SIZE) return null;

  const view = new Uint32Array(bytes.buffer, bytes.byteOffset, 4);
  if (!(view[0] === 0 && view[1] === 0 && view[2] === 0 && view[3] === 0)) {
    return null;
  }

  const publicKey = bytes.subarray(32, 64);
  const signature = bytes.subarray(64, 128);

  return [{ payloadLength, publicKey, signature }, bytes.subarray(MARKER_SIZE)];
}

async function readTxn(bytes) {
  let payloadLength, publicKey, signature;
  [{ payloadLength, publicKey, signature }, bytes] = readTxnMarker(bytes);

  if (payloadLength > bytes.length) {
    throw Error("Bad Txn: Marker declares more bytes than available.");
  }
  const payload = bytes.subarray(0, payloadLength);

  const isSigned = await ed.verify(signature, payload, publicKey);
  if (!isSigned) throw Error("Bad Txn: Couldn't verify signature.");

  return [{ payload, publicKey }, bytes.subarray(payloadLength)];
}

const TRIBLE_SIZE_IN_UINT32 = TRIBLE_SIZE / Uint32Array.BYTES_PER_ELEMENT;
function recoverFromBrokenTxn(bytes) {
  const view = new Uint32Array(bytes.buffer, bytes.byteOffset);

  for (let i = 0; i < view.length - 4; i = i + TRIBLE_SIZE_IN_UINT32) {
    if (
      view[i] === 0 &&
      view[i + 1] === 0 &&
      view[i + 2] === 0 &&
      view[i + 3] === 0
    ) {
      return bytes.subarray(i * Uint32Array.BYTES_PER_ELEMENT);
    }
  }
}

export function splitTribles(bytes) {
  const tribles = [];
  for (let t = 0; t < bytes.length; t += TRIBLE_SIZE) {
    tribles.push(bytes.subarray(t, t + TRIBLE_SIZE));
  }
  return tribles;
}

export async function* readAllTxns(bytes) {
  while (bytes.length > MARKER_SIZE) {
    try {
      let [{ payload, publicKey }, bytes] = await readTxn(bytes);
      yield {
        publicKey,
        tribleset: new TribleSet().with(splitTribles(payload)),
      };
    } catch (e) {
      bytes = recoverFromBrokenTxn(bytes);
    }
  }
}
