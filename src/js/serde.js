import { TRIBLE_SIZE } from "./trible.js";
import { blake3 } from "./wasm.js";
import { NS } from "./namespace.js";
import { UFOID } from "./types/ufoid.js";

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

const BLAKE3_VERIFICATION = UFOID.now();
const verificationMethodId = UFOID.now();

const serdeNS = new NS({
  [id]: { ...types.ufoid },
  verificationMethod: { id: verificationMethodId, ...types.ufoid },
});

const HEADER_SIZE = 64;

export function serialize(kb, metaId) {
    const tribleset = kb.tribleset;
    const tribles_count = tribleset.count();
    const tribles = tribleset.tribles();

    let buffer = new Uint8Array(HEADER_SIZE + (tribles_count * TRIBLE_SIZE));

    buffer.subarray(48, 64).set(metaId);

    let i = 0;
    for (const trible of tribles) {
        buffer.set(trible, HEADER_SIZE + (i * TRIBLE_SIZE));
        i += 1;
    }

    let { verificationMethod } = serdeNS.walk(kb, metaId);
    if(!verificationMethod) {
        throw Error("failed to serialize: no verification method specified")
    }
    if (verificationMethod.to_hex() === BLAKE3_VERIFICATION) {
        blake3(buffer.subarray(48), buffer.subarray(16, 48))
        return buffer;
    }

    throw Error("failed to serialize: unsupported verification method");
}

function* splitTribles(bytes) {
    for (let t = 0; t < bytes.length; t += TRIBLE_SIZE) {
      yield bytes.subarray(t, t + TRIBLE_SIZE);
    }
  }

export function deserialize(kb, bytes) {
    const dataset = kb.tribleset.with(
        splitTribles(bytes.subarray(HEADER_SIZE)),
    );
    
    const metaId = new UFOID(bytes.slice(48, 64));
    
    let { verificationMethod } = serdeNS.walk(kb, metaId);
    if(!verificationMethod) {
        throw Error("failed to deserialize: no verification method specified")
    }
    if (verificationMethod.to_hex() === BLAKE3_VERIFICATION) {
        if(!equalValue(buffer.subarray(16, 48), blake3(buffer.subarray(48)))) {
            throw Error("failed to deserialize: verification failed");
        }
        return { metaId, dataset };
    }

    throw Error("failed to deserialize: unsupported verification method");
}
