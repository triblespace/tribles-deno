import { emptyIdPACT } from "./pact.js";

export class IDOwner {
  constructor(factory) {
    this.factory = factory;
    this.ownedIDs = emptyIdPACT;
  }

  [Symbol.iterator]() {
    return this;
  }
  next() {
    const value = this.factory();
    this.ownedIDs.put(value);
    return { value };
  }

  validator(middleware = (commits) => commits) {
  }
}
