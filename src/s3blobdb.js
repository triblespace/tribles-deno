const { S3 } = require("aws-sdk");

const { emptyValuePART } = require("./part.js");

class S3BlobDB {
  constructor(
    config,
    bucket = new S3({
      apiVersion: '2006-03-01',
      region: config.region,
      params: { Bucket: config.bucket },
      credentials:
      {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretKey
      }
    }),
    pendingWrites = [],
    localBlobCache = new Map(),
  ) {
    this.config = config;
    this.bucket = bucket;
    this.pendingWrites = pendingWrites;
    this.localBlobCache = localBlobCache;
  }

  put(blobs) {
    const pendingWrites = this.pendingWrites.filter((pw) => !pw.resolved);
    for (let b = 0; b < blobs.length; b++) {
      const [key, blob] = blobs[b];
      const blobName = [...new Uint8Array(key)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const pendingWrite = {
        promise: null,
        resolved: false,
      };
      this.pendingWrites.push(pendingWrite);
      this.bucket.putObject({
        Key: blobName,
        Body: blob
      }).promise().then(() => pendingWrite.resolved = true);
      if (!this.localBlobCache.get(blobName)) {
        this.localBlobCache.set(blobName, blob);
      }
    }

    return new S3BlobDB(
      this.config,
      this.bucket,
      pendingWrites,
      this.localBlobCache,
    );
  }

  async get(k) {
    const blobName = [...new Uint8Array(k)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const cachedValue = this.localBlobCache.get(blobName);
    if (cachedValue) {
      return cachedValue;
    }
    const pulledValue = (await this.bucket.getObject({ key: blobName }).promise()).Body;
    this.localBlobCache.set(blobName, pulledValue);
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

  equals(other) {
    return (other instanceof S3BlobDB) && (this.bucket === other.bucket);
  }

  merge(other) {
    if (this.bucket !== other.bucket) {
      throw Error(
        "Can't merge S3BlobDBs with different buckets through this client, use the 'trible' cmd-line tool instead.",
      );
    }
    return this;
  }

  shrink(tribledb) {
    return this;
  }
}

module.exports = { S3BlobDB };
