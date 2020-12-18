import { S3Bucket } from "https://deno.land/x/s3@0.3.0/mod.ts";

import { emptyValuePART } from "./part.js";

class S3BlobDB {
  constructor(
    config,
    bucket = new S3Bucket(config),
    pendingWrites = [],
    localBlobCache = new Map(),
    blobsCount = 0,
    blobsSize = 0,
  ) {
    this.config = config;
    this.bucket = bucket;
    this.pendingWrites = pendingWrites;
    this.localBlobCache = localBlobCache;
    this.blobsCount = blobsCount;
    this.blobsSize = blobsSize;
  }

  put(blobs) {
    let blobsCount = this.blobsCount;
    let blobsSize = this.blobsSize;
    let nblobs = this.blobs.batch();
    const pendingWrites = pendingWrites.filter((pw) => !pw.resolved);
    for (let b = 0; b < blobs.length; b++) {
      const [key, blob] = blobs[b];
      nblobs = nblobs.put(key, (old) => {
        if (old) {
          return old;
        } else {
          blobsCount++;
          blobsSize += blob.length;
          const blobName = [...new Uint8Array(key)]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

          const pendingWrite = {
            promise: null,
            resolved: false,
          };
          this.pendingWrites.push(b.putObject(
            blobName,
            blob,
          )).then(() => pendingWrite.resolved = true);
          if (!this.localBlobCache.get(blobName)?.deref()) {
            this.localBlobCache.put(blobName, new WeakRef(blob));
          }
          return blob;
        }
      });
    }

    return new S3BlobDB(
      this.config,
      this.bucket,
      pendingWrites,
      nblobs.complete(),
      blobsCount,
      blobsSize,
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
    this.localBlobCache.put(blobName, new WeakRef(pulledValue));
    return pulledValue;
  }

  async flush() {
    const reasons =
      (await Promise.allSettled(this.pendingWrites.map((pw) => pw.promise)))
        .filter((r) => r.status === "rejected")
        .map((r) => r.reason);
    if (reasons.length !== 0) {
      const e = Error("Couldn't flush S3BlobDB, some puts returned errors.");
      e.reasons = reasons;
      throw e;
    }
  }

  empty() {
    return this;
  }
}

export { S3BlobDB };
