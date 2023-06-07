import { emptyValueIdIdTriblePACT, emptyValuePACT } from "./pact.js";
import { scrambleVAE, V } from "./trible.js";
import { masked } from "./constraints/masked.js";

/** A blobcache is an immutably persistent datastructure that stores blobs associated
 * with the value hashes stored in the tribles of a tribleset.
 * Blobs are either strongly or weakly referenced. Strong blobs are not yet
 * synchronized to other storage and partake in set operations over the blobcache.
 * Weak blobs can be reconstructed via the BlobCaches `onMiss` handler and are therefore
 * held by weak references, meaning that they can be garbage collected should
 * memory consumption require it.
 */
export class BlobCache {
  /**
   * Create a blobcache.
   * @param {Function} onMiss - Callback invoked when a blob is retreived that can't be found in the strong nor weak blobs.
   * @param {PACT} strong - A PACT storing the strong blobs.
   * @param {PACT} weak - A PACT storing the weak blobs.
   */
  constructor(
    onMiss = async () => {},
    strong = emptyValueIdIdTriblePACT,
    weak = emptyValuePACT,
  ) {
    this.strong = strong;
    this.weak = weak;
    this.onMiss = onMiss;
  }

  /**
   * Returns a new blobcache object with the passed blobs stored as strong blobs.
   * @param {Iterable} blobs - A collection of `[trible, blob]` pairs.
   * @return {BlobCache} A new blobcache.
   */
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

  /**
   * Retrieves the blob for the given key, performing a lookup in the cache first,
   * and falling back to using the caches `onMiss handler on failure.
   * @param {Uint8Array} key - The 32 bytes identifying the blob.
   * @return {Promise<Uint8Array>} The retrieved blob data.
   */
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
    return this.strong.segmentConstraint([v, a, e]);
  }

  strongBlobs() {
    const blobs = [];
    for (
      const key of new find(
        (ctx, { v }, [e, a]) =>
          masked(
            this.strong.segmentConstraint([v, a, e]),
            [e, a],
          ),
        (variables, binding) => {
          const { v } = variables.namedVars();
          return binding.get(v.index);
        },
      )
    ) {
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
