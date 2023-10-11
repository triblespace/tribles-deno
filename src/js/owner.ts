import { Entry, batch, emptyIdPATCH } from "./patch.ts";
import { IdSchema } from "./schemas.ts";
import { ID_SIZE } from "./trible.ts";
import { fixedUint8Array } from "./util.ts";

export class IDOwner<Id> {
  schema: IdSchema<Id>;
  ids: typeof emptyIdPATCH;

  constructor(schema: IdSchema<Id>) {
    this.ids = emptyIdPATCH;

    const factory = () => {
      const b = fixedUint8Array(ID_SIZE);
      const id = schema.factory();
      schema.encodeValue(id, b);
      this.ids.put(batch(), new Entry(b, undefined));
      return id;
    }
    
    this.schema = {
      ...schema,
      factory,
    };
  }

  validator(middleware = (commit) => [commit]) {
    // deno-lint-ignore no-this-alias
    const self = this;
    return function* (commit) {
      //TODO implement 'not' constraint and use that to compute values that
      //are in the commit but not in the onwedIDs.
      yield* middleware(commit);
    };
  }
}
