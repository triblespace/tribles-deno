import { Commit } from "./commit.ts";
import { batch, emptyIdPATCH, Entry } from "./patch.ts";
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
      schema.encodeId(id, b);
      this.ids.put(batch(), new Entry(b, undefined));
      return id;
    };

    this.schema = {
      ...schema,
      factory,
    };
  }

  validate(_commit: Commit) {
    //TODO implement 'not' constraint and use that to compute values that
    //are in the commit but not in the onwedIDs.
    throw Error("TODO");
  }
}
