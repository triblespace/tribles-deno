import { emptyIdPACT } from "./pact.js";
import { VALUE_SIZE } from "./trible.js";

export class IDOwner {
  constructor(type) {
    this.idType = type;
    this.ownedIDs = emptyIdPACT;
  }

  type() {
    return {
      ...this.idType,
      factory: this.factory(),
    };
  }

  factory() {
    return () => {
      const b = new Uint8Array(VALUE_SIZE);
      const factory = this.idType.factory;
      const id = factory();
      this.idType.encoder(id, b);
      this.ownedIDs.put(b);
      return id;
    };
  }

  validator(middleware = (commit) => [commit]) {
    const self = this;
    return function* (commit) {
      //TODO implement 'not' constraint and use that to compute values that
      //are in the commit but not in the onwedIDs.
      yield* middleware(commit);
    };
  }
}
