import {
  emptyValueIdIdTriblePACT,
  emptyValuePACT,
  SegmentConstraint,
} from "./pact.js";
import { A, E, scrambleVAE, TRIBLE_SIZE, V } from "./trible.js";
import { blake2b256, hash_equal } from "./wasm.js";
import {
  IntersectionConstraint,
  LOWER,
  MaskedConstraint,
  Query,
} from "./query.js";
function padded(length, alignment) {
  return length + (alignment - (length % alignment));
}

export function deserialize(tribleset, blobcache, serialized_bytes) {
  if ((serialized_bytes.length % 64) !== 0) {
    throw Error("serialized blob data must be multiple of 64byte");
  }
  let blobs = emptyValuePACT.batch();

  let offset = 0;
  const dataview = new DataView(serialized_bytes.buffer);
  while (offset < serialized_bytes.length) {
    const length_start_offset = offset + 24;
    const blob_length = dataview.getBigUint64(length_start_offset, false);

    const hash_start_offset = offset + 32;
    const hash_end_offset = offset + 64;
    const provided_hash = serialized_bytes.subarray(
      hash_start_offset,
      hash_end_offset,
    );

    const blob_start_offset = 64 + offset;
    const blob_end_offset = 64 + offset + blob_length;
    if (serialized_bytes.length < blob_end_offset) {
      throw Error("bad length for blob");
    }
    const blob = serialized_bytes.subarray(blob_start_offset, blob_end_offset);
    const computed_hash = new Uint8Array(32);
    blake2b256(blob, computed_hash);
    if (!hash_equal(provided_hash, computed_hash)) {
      throw Error("bad hash for blob");
    }
    blobs = blobs.put(provided_hash, blob);
    offset += 64 + padded(blob_length, 64);
  }
  blobs.complete();

  let blobdata = blobcache;
  for (
    const r of new Query(
      new IntersectionConstraint([
        tribleset.tripleConstraint(0, 1, 2),
        new SegmentConstraint(blobs, [2]),
      ]),
    )
  ) {
    const e = r.get(0);
    const a = r.get(1);
    const v = r.get(2);

    const trible = new Uint8Array(TRIBLE_SIZE);
    E(trible).set(LOWER(e));
    A(trible).set(LOWER(a));
    V(trible).set(v);

    const blob = this.blobs.get(v);
    blobdata = blobdata.put(trible, blob);
  }
  return blobdata;
}

export function serialize(blobcache) {
  const timestamp = Date.now();
  const blobs = blobcache.strongBlobs();
  const buffer_length = (blobs.length * 64) +
    blobs.reduce(
      (acc, { blob }) => acc + padded(blob.length, 64),
      0,
    );
  const serialized_bytes = new Uint8Array(buffer_length);
  const dataview = new DataView(serialized_bytes.buffer);
  let offset = 0;
  for (const { key, blob } of blobs) {
    dataview.setBigUint64(offset + 16, timestamp, false);
    dataview.setBigUint64(offset + 24, blob.length, false);
    serialized_bytes.subarray(offset + 32, offset + 64).set(key);
    offset += 64;
    serialized_bytes.subarray(offset, padded(blob.length, 64)).set(blob);
  }
  return bytes;
}

export class BlobCache {
  constructor(
    onMiss = async () => {},
    strong = emptyValueIdIdTriblePACT,
    weak = emptyValuePACT,
  ) {
    this.strong = strong;
    this.weak = weak;
    this.onMiss = onMiss;
  }

  with(blobs) {
    let weak = this.weak;
    let strong = this.strong;

    for (const [trible, blob] of blobs) {
      const key = V(trible);
      const cached_blob = this.weak.get(key).deref();

      let new_or_cached_blob = blob;
      if (cached_blob === undefined) {
        weak = weak.put(key, new WeakRef(blob));
      } else {
        new_or_cached_blob = cached_blob;
      }
      strong = strong.put(scrambleVAE(trible), new_or_cached_blob);
    }

    return new BlobCache(this.onMiss, strong, weak);
  }

  async get(key) {
    let blob = this.weak.get(key).deref();

    if (blob === undefined) {
      blob = await this.onMiss(key);
      if (blob === undefined) {
        throw Error("No blob for key.");
      }
      this.weak = this.weak.put(key, new WeakRef(blob));
    }
    return blob;
  }

  strongConstraint(e, a, v) {
    return new SegmentConstraint(this.strong, [v, a, e]);
  }

  strongBlobs() {
    const blobs = [];
    for (
      const r of new Query(
        new MaskedConstraint(new SegmentConstraint(this.strong, [0, 1, 2]), [
          1,
          2,
        ]),
      )
    ) {
      const key = r.get(1);
      const blob = this.weak.get(key);
      blobs.push({ key, blob });
    }
  }

  empty() {
    return new BlobCache(this.onMiss, this.strong.empty(), this.weak);
  }

  clear() {
    return new BlobCache(this.onMiss, this.strong.empty(), this.weak.empty());
  }

  union(other) {
    return new BlobCache(
      this.onMiss,
      this.strong.union(other.strong),
      this.weak.union(other.weak),
    );
  }

  subtract(other) {
    return new BlobCache(
      this.onMiss,
      this.strong.subtract(other.strong),
      this.weak.union(other.weak),
    );
  }

  difference(other) {
    return new BlobCache(
      this.onMiss,
      this.strong.difference(other.strong),
      this.weak.union(other.weak),
    );
  }

  intersect(other) {
    return new BlobCache(
      this.onMiss,
      this.strong.intersect(other.strong),
      this.weak.union(other.weak),
    );
  }
}
