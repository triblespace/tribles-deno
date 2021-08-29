import { S3Bucket } from "https://deno.land/x/s3@0.3.0/mod.ts";

import { emptyValuePACT } from "./pact.js";

class S3BlobDB {
  constructor(
    config,
    bucket = new S3Bucket(config),
    pendingWrites = [],
    localBlobCache = new Map()
  ) {
    this.config = config;
    this.bucket = bucket;
    this.pendingWrites = pendingWrites;
    this.localBlobCache = localBlobCache;
  }

  put(blobs) {
    // Each put returns a new BlobDB instance, sharing the parent's blob cache
    // but tracking only still pending and new writes.
    // This way older KBs can only wait on their blobs,
    // and resolved write promises can be GCed.
    const pendingWrites = this.pendingWrites.filter((pw) => !pw.resolved);
    for (const [key, blob] of blobs) {
      const blobName = [...new Uint8Array(key)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const pendingWrite = {
        promise: null,
        resolved: false,
      };
      pendingWrite.promise = this.bucket
        .putObject(blobName, blob)
        .then(() => (pendingWrite.resolved = true));
      pendingWrites.push(pendingWrite);
      if (!this.localBlobCache.get(blobName)?.deref()) {
        this.localBlobCache.set(blobName, new WeakRef(blob));
      }
    }

    return new S3BlobDB(
      this.config,
      this.bucket,
      pendingWrites,
      this.localBlobCache
    );
  }

  async get(k) {
    const blobName = [...new Uint8Array(k)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const cachedValue = this.localBlobCache.get(blobName)?.deref();
    if (cachedValue) {
      return cachedValue;
    }
    const pulledValue = (await this.bucket.getObject(blobName)).body;
    this.localBlobCache.set(blobName, new WeakRef(pulledValue));
    return pulledValue;
  }

  async flush() {
    const reasons = (
      await Promise.allSettled(this.pendingWrites.map((pw) => pw.promise))
    )
      .filter((r) => r.status === "rejected")
      .map((r) => r.reason);
    if (reasons.length !== 0) {
      const e = Error(
        "Couldn't flush S3BlobDB, some puts returned errors. See error.reasons for more info."
      );
      e.reasons = reasons;
      throw e;
    }
  }

  empty() {
    return this;
  }

  isEqual(other) {
    return other instanceof S3BlobDB && this.bucket === other.bucket;
  }

  merge(other) {
    if (this.bucket !== other.bucket) {
      throw Error(
        "Can't merge S3BlobDBs with different buckets through this client, use the 'trible' cmd-line tool instead."
      );
    }
    return this;
  }

  shrink(tribledb) {
    return this;
  }
}

export { S3BlobDB };
