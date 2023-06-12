import { UFOID } from "./types/ufoid.js";
import { Commit } from "./commit.js";

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
   * Adds facts to the passed knowledge base.
   * The passed id can be used to attach metadata to this commit by using it as
   * an id of an entity representing the commit itself.
   *
   * @callback commitFn
   * @param {KB} basekb - the state of the knowledge base before the commit
   * @param {Uint8Array} commitId - the entity id representing this commit
   * @return {KB} The basekb extended with new data.
   */

  /**
   * Change the contents of this head, using its middleware to change and
   * validate the resulting commit(s).
   *
   * The async call returns when all subscribers are notified of the resulting commits.
   *
   * @param {commitFn} commitFn - A function that computes the changes to the stored KB.
   * @param {Uint8Array} commitId - the entity id representing this commit
   */
  async commit(commitFn, commitId = UFOID.now()) {
    const baseKB = this._current_kb;
    const currentKB = commitFn(baseKB, commitId);
    const commitKB = currentKB.subtract(baseKB);

    let commits = this._middleware(
      new Commit(commitId, baseKB, commitKB, currentKB),
    );

    for await (const commit of commits) {
      this._current_kb = commit.currentKB;
      for (const sub of this._subscriptions) {
        await sub(commit);
      }
    }
  }

  /**
   * Returns the current state of the KB stored in this head.
   *
   * @return {KB} The current KB.
   */
  peek() {
    return this._current_kb;
  }

  /**
   * Adds the passed function to the list of subscribers.
   * It will be called whenever a commit is created.
   *
   * @param {Function} fn - A callback to be fired whenever a commit is produced.
   */
  sub(fn) {
    this._subscriptions.add(fn);
  }

  /**
   * Remove the passed function from the list of subscribers.
   *
   * @param {Function} fn - The callback to be removed.
   */
  unsub(fn) {
    this._subscriptions.remove(fn);
  }
}
