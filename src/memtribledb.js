import { INDEX_COUNT, indexOrder } from "./query.js";
import { emptyTriblePART, emptyValuePART } from "./part.js";

class MemTribleDB {
  constructor(
    index = new Array(INDEX_COUNT).fill(emptyTriblePART),
    tribleCount = 0,
  ) {
    this.tribleCount = tribleCount;
    this.index = index;
  }

  with(tribles) {
    let totalTribleCount = this.tribleCount;
    // deno-lint-ignore prefer-const
    let [eavIndex, ...restIndex] = this.index;
    const batches = restIndex.map((i) => i.batch());
    for (const trible of tribles) {
      const idx = eavIndex.put(trible);
      if (idx === eavIndex) {
        continue;
      }
      eavIndex = idx;
      for (let i = 1; i < INDEX_COUNT; i++) {
        const reorderedTrible = indexOrder[i](trible);
        if (reorderedTrible) {
          batches[i - 1].put(reorderedTrible);
        }
      }
      totalTribleCount++;
    }
    if (this.index[0] === eavIndex) {
      return this;
    }
    return new MemTribleDB(
      [eavIndex, ...batches.map((b) => b.complete())],
      totalTribleCount,
    );
  }

  cursor(index) {
    return this.index[index].cursor();
  }

  empty() {
    return new MemTribleDB();
  }
}

export { MemTribleDB };
