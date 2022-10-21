import { UFOID } from "./types/ufoid.js";
import { Commit, validateCommitSize } from "./commit.js";
import { KB } from "../../build/trible.js";

export class Head {
  constructor(initialKB, validationFn = validateCommitSize()) {
    this._current_kb = initialKB;
    this._validationFn = validationFn;
    this._subscriptions = new Set();
  }

  commit(commitFunction) {
    const commitId = UFOID.now();
    const baseKB = this._current_kb;
    const currentKB = commitFunction(baseKB, commitId);
    const commitKB = currentKB.subtract(baseKB);
    
    const commit = new Commit(baseKB, commitKB, currentKB, commitId);

    this._validationFn(commit);

    this._kb = currentKB;

    for (const sub of this._subscriptions) {
      sub(commit);
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
