import { UFOID } from "./types/ufoid.js";
import { Commit, validateCommitSize } from "./commit.js";

/**
 * Heads are a mutable container type for KBs.
 * They manage commit validation and custom logic
 * via middlewares, and provide a means to subscribe to changes.
 */
export class Head {
  constructor(initialKB, middleware = (commits) => commits) {
    this._current_kb = initialKB;
    this._middleware = middleware;
    this._subscriptions = new Set();
  }

  /**
   * @param {function} commitFn
   */
  async commit(commitFn, commitId = UFOID.now()) {
    const baseKB = this._current_kb;
    const currentKB = commitFn(baseKB, commitId);
    const commitKB = currentKB.subtract(baseKB);

    let commits = this._middleware([
      new Commit(commitId, baseKB, commitKB, currentKB),
    ]);

    for (const commit of commits) {
      this._current_kb = commit.currentKB;
      for (const sub of this._subscriptions) {
        await sub(commit);
      }
    }
  }

  peek() {
    return this._current_kb;
  }

  sub(fn) {
    this._subscriptions.add(fn);
  }

  unsub(fn) {
    this._subscriptions.remove(fn);
  }
}
