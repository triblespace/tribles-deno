import { S3Bucket } from "https://deno.land/x/s3@0.5.0/mod.ts";
import { Commit } from "../commit";
import { KB } from "../kb";

function hashToName(hash) {
  return Array.from(hash).map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export class S3BlobConnector {
  constructor(
    bucket,
  ) {
    this.bucket = bucket;
  }

  missHandler() {
    return async (hash) => {
      const request = await this.bucket.getObject(hashToName(hash));
      return request.body;
    };
  }

  flushMiddleware(middleware = (commit) => [commit]) {
    return async function* (commit) {
      const blobcache = commit.currentKB.blobcache;
      const flushedBlobs = blobcache.strongBlobs();
      const flushOps = flushedBlobs.map(({ key, blob }) =>
        this.bucket.putObject(hashToName(key), blob)
      );
      await Promise.all(flushOps);

      yield Commit(
        commit.commitId,
        commit.baseKB,
        commit.commitKB,
        new KB(commit.currentKB.tribleset, blobcache.clear()),
      );
    };
  }
}
