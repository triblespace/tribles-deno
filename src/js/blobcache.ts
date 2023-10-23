import { Entry, PATCH, naturalOrder, singleSegment, batch } from "./patch.ts";
import { V, VAEOrder, TRIBLE_SIZE, TribleSegmentation, VALUE_SIZE, Value, Blob } from "./trible.ts";
import { FixedUint8Array, fixedUint8Array } from "./util.ts";

// TODO I think we can split this into a strongly referencing core type
// and a caching wrapper type.

/** A blobcache is an immutably persistent datastructure that stores blobs associated
 * with the value hashes stored in the tribles of a tribleset.
 * Blobs are either strongly or weakly referenced. Strong blobs are not yet
 * synchronized to other storage and partake in set operations over the blobcache.
 * Weak blobs can be reconstructed via the BlobCaches `onMiss` handler and are therefore
 * held by weak references, meaning that they can be garbage collected should
 * memory consumption require it.
 */
export class BlobCache {
  strong: PATCH<typeof TRIBLE_SIZE, typeof VAEOrder, typeof TribleSegmentation, Uint8Array>;
  weak: PATCH<typeof VALUE_SIZE, typeof naturalOrder, typeof singleSegment, WeakRef<Uint8Array>>
  onMiss: (value: FixedUint8Array<typeof VALUE_SIZE>) => Promise<Uint8Array>;

  /**
   * Create a blobcache.
   * @param onMiss - Callback invoked when a blob is retreived that can't be found in the strong nor weak blobs.
   * @param strong - A PATCH storing the strong blobs.
   * @param weak - A PATCH storing the weak blobs.
   */
  constructor(
    onMiss: (value: FixedUint8Array<typeof VALUE_SIZE>) => Promise<Uint8Array> = (_value: FixedUint8Array<typeof VALUE_SIZE>) => Promise.reject(Error("no onMiss handler provided")),
    strong = new PATCH<typeof TRIBLE_SIZE, typeof VAEOrder, typeof TribleSegmentation, Uint8Array>(TRIBLE_SIZE, VAEOrder, TribleSegmentation, undefined),
    weak = new PATCH<typeof VALUE_SIZE, typeof naturalOrder, typeof singleSegment, WeakRef<Uint8Array>>(VALUE_SIZE, naturalOrder, singleSegment, undefined),
  ) {
    this.strong = strong;
    this.weak = weak;
    this.onMiss = onMiss;
  }

  /**
   * Returns a new blobcache object with the passed blobs stored as strong blobs.
   * @param blobs - A collection of `[trible, blob]` pairs.
   * @return A new blobcache.
   */
  with(blobs: Iterable<[FixedUint8Array<typeof TRIBLE_SIZE>, Uint8Array]>): BlobCache {
    const btch = batch();

    let weak = this.weak;
    let strong = this.strong;

    for (const [trible, blob] of blobs) {
      const key = V(trible);
      const cached_blob = this.weak.get(key)?.deref();

      let new_or_cached_blob = blob;
      if (cached_blob === undefined) {
        weak = weak.put(btch, new Entry(key ,new WeakRef(blob)));
      } else {
        new_or_cached_blob = cached_blob;
      }
      strong = strong.put(btch, new Entry(trible, new_or_cached_blob));
    }

    return new BlobCache(this.onMiss, strong, weak);
  }

  /**
   * Retrieves the blob for the given key, performing a lookup in the cache first,
   * and falling back to using the caches `onMiss handler on failure.
   * @param key - The 32 bytes identifying the blob.
   * @return The retrieved blob data.
   */
  async get(key: Value): Promise<Blob> {
    let blob = this.weak.get(key)?.deref();

    if (blob === undefined) {
      blob = await this.onMiss(key);
      if (blob === undefined) {
        throw Error("No blob for key.");
      }
      this.weak = this.weak.put(batch(), new Entry(key, new WeakRef(blob)));
    }
    return blob;
  }

  strongBlobs() {
    return this.strong.infixes((trible, blob) => ({key: V(trible), blob }), fixedUint8Array(64), 0, VALUE_SIZE);
  }

  clear() {
    return new BlobCache(this.onMiss, this.strong.empty(), this.weak);
  }

  empty() {
    return new BlobCache(this.onMiss, this.strong.empty(), this.weak.empty());
  }

  union(other: BlobCache) {
    return new BlobCache(
      this.onMiss,
      this.strong.union(other.strong),
      this.weak.union(other.weak),
    );
  }

  /*
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
  */
}
