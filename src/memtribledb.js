const { EAV, INDEX_COUNT, indexOrder } = require("./query.js");
const { emptyTriblePART, emptyValuePART } = require("./part.js");

class MemTribleDB {
  constructor(
    index = new Array(INDEX_COUNT).fill(emptyTriblePART),
  ) {
    this.index = index;
  }

  with(tribles) {
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
    }
    if (this.index[0] === eavIndex) {
      return this;
    }
    return new MemTribleDB(
      [eavIndex, ...batches.map((b) => b.complete())],
    );
  }

  cursor(index) {
    return this.index[index].cursor();
  }

  empty() {
    return new MemTribleDB();
  }

  isEmpty() {
    return this.index[EAV].isEmpty();
  }

  isEqual(other) {
    return this.index[EAV].isEqual(other.index[EAV]);
  }

  isSubsetOf(other) {
    return this.index[EAV].isSubsetOf(other.index[EAV]);
  }

  isIntersecting(other) {
    return this.index[EAV].isIntersecting(other.index[EAV]);
  }

  union(other) {
    const index = new Array(INDEX_COUNT);
    for (let i = 0; i < INDEX_COUNT; i++) {
      index[i] = this.index[i].union(other.index[i]);
    }
    return new MemTribleDB(index);
  }

  subtract(other) {
    const index = new Array(INDEX_COUNT);
    for (let i = 0; i < INDEX_COUNT; i++) {
      index[i] = this.index[i].subtract(other.index[i]);
    }
    return new MemTribleDB(index);
  }

  difference(other) {
    const index = new Array(INDEX_COUNT);
    for (let i = 0; i < INDEX_COUNT; i++) {
      index[i] = this.index[i].difference(other.index[i]);
    }
    return new MemTribleDB(index);
  }

  intersect(other) {
    const index = new Array(INDEX_COUNT);
    for (let i = 0; i < INDEX_COUNT; i++) {
      index[i] = this.index[i].intersect(other.index[i]);
    }
    return new MemTribleDB(index);
  }
}

module.exports = { MemTribleDB };
