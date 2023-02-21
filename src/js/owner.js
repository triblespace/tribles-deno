import { emptyIdPACT } from "./pact.js";

export class IDOwner {
  constructor(factory) {
    this.innerFactory = factory;
    this.ownedIDs = emptyIdPACT;
  }

  factory() {
    return () => {
      const value = this.innerFactory();
      this.ownedIDs.put(value);
      return value;
    };
  }

  validator(middleware = (commits) => commits) {
    return middleware;
  }
}
