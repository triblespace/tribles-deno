class Delta {
    constructor(old_kb, new_kb) {
        this.old_kb = old_kb;
        this.new_kb = new_kb;
        this.delta_kb = new_kb.subtract(old_kb);
    }

    patternConstraint(pattern) {
        for (const [_e, _a, v] of pattern) {
        v.proposeBlobCache(this.new_kb.blobcache);
        }
        return currentKB.tribleset.patternConstraint(pattern);
        //new DeltaConstraint(this.old_kb, this.new_kb, this.delta_kb, pattern),
    }
}

export function delta(old_kb, new_kb) {
    return new Delta(old_kb, new_kb);
}
