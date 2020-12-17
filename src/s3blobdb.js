import s3 from "https://deno.land/x/s3@0.3.0/mod.ts";

import { emptyValuePART } from "./part.js";

/*
{region: "local",
  accessKeyID: "jeanluc",
  secretKey: "teaearlgreyhot",
  endpointURL: "http://127.0.0.1:9000"}
*/

class S3BlobDB {
  constructor(
    config,
    bucket = new s3.S3Bucket(config),
    pendingWrites = [],
    localBlobs = emptyValuePART,
    blobsCount = 0,
    blobsSize = 0,
  ) {
    this.config = config;
    this.bucket = bucket;
    this.pendingWrites = pendingWrites;
    this.localBlobs = localBlobs;
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

  get(k) {
    return this.localBlobs.get(k);
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
}

export { S3BlobBD };
