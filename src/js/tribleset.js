import {
  Entry,
  emptyIdIdValueTriblePATCH,
  emptyIdValueIdTriblePATCH,
  emptyValueIdIdTriblePATCH,
} from "./patch.ts";
import {
  scrambleAEV,
  scrambleAVE,
  scrambleEAV,
  scrambleEVA,
  scrambleVAE,
  scrambleVEA,
} from "./trible.js";
import { and } from "./constraints/and.js";
import { ByteBitset } from "./bitset.js";

/**
 * A constraint limits the passed variables e, a and v to values with
 * a corresponding eav trible existing in the passed tribleset.
 */
class TribleConstraint {
  constructor(tribleSet, e, a, v) {
    if (e === a || e === v || a == v) {
      throw new Error(
        "Triple variables must be uniqe. Use explicit equality when inner constraints are required.",
      );
    }

    this.eVar = e;
    this.aVar = a;
    this.vVar = v;

    this.set = tribleSet;
  }

  variables() {
    let bitset = new ByteBitset();
    bitset.set(this.eVar);
    bitset.set(this.aVar);
    bitset.set(this.vVar);
    return bitset;
  }

  estimate(variable, binding) {
    let bound = binding.bound();
    const e = bound.has(this.eVar);
    const a = bound.has(this.aVar);
    const v = bound.has(this.vVar);

    const $e = this.eVar === variable;
    const $a = this.aVar === variable;
    const $v = this.vVar === variable;

    if (e && a && v) {
      throw Error("estimate for fulfilled constraint");
    }

    if (e && a && !v && $v) {
      return eav.estimate(binding.get(this.eVar), binding.get(this.aVar));
    }

    if (e && !a && v) {
      //return eva;
    }
    if (e && !a && !v) {
      //return eav;
    }

    if (!e && a && v) {
      //return ave;
    }
    if (!e && a && !v) {
      //return aev;
    }
    if (!e && !a && v) {
      //return vea;
    }

    if (!e && !a && !v) {
      //return eav;
    }
  }

  propose(variable, binding) {
  }

  confirm(variable, binding, values) {
  }
}
/*
        let e_bound = binding.bound.is_set(self.variable_e.index);
        let a_bound = binding.bound.is_set(self.variable_a.index);
        let v_bound = binding.bound.is_set(self.variable_v.index);

        let e_var = self.variable_e.index == variable;
        let a_var = self.variable_a.index == variable;
        let v_var = self.variable_v.index == variable;

        if let Some(trible) = Trible::new_raw_values(
            binding.get(self.variable_e.index).unwrap_or([0; 32]),
            binding.get(self.variable_a.index).unwrap_or([0; 32]),
            binding.get(self.variable_v.index).unwrap_or([0; 32]),
        ) {
            match (e_bound, a_bound, v_bound, e_var, a_var, v_var) {
                (false, false, false, true, false, false) => {
                    self.set.eav.segmented_len(trible.data, E_START)
                }
                (false, false, false, false, true, false) => {
                    self.set.aev.segmented_len(trible.data, A_START)
                }
                (false, false, false, false, false, true) => {
                    self.set.vea.segmented_len(trible.data, V_START)
                }

                (true, false, false, false, true, false) => {
                    self.set.eav.segmented_len(trible.data, A_START)
                }
                (true, false, false, false, false, true) => {
                    self.set.eva.segmented_len(trible.data, V_START)
                }

                (false, true, false, true, false, false) => {
                    self.set.aev.segmented_len(trible.data, E_START)
                }
                (false, true, false, false, false, true) => {
                    self.set.ave.segmented_len(trible.data, V_START)
                }

                (false, false, true, true, false, false) => {
                    self.set.vea.segmented_len(trible.data, E_START)
                }
                (false, false, true, false, true, false) => {
                    self.set.vae.segmented_len(trible.data, A_START)
                }

                (false, true, true, true, false, false) => {
                    self.set.ave.segmented_len(trible.data, E_START)
                }
                (true, false, true, false, true, false) => {
                    self.set.eva.segmented_len(trible.data, A_START)
                }
                (true, true, false, false, false, true) => {
                    self.set.eav.segmented_len(trible.data, V_START)
                }
                _ => panic!(),
            }
        } else {
            0
        }

    fn propose(&self, variable: VariableId, binding: Binding) -> Vec<Value> {
        let e_bound = binding.bound.is_set(self.variable_e.index);
        let a_bound = binding.bound.is_set(self.variable_a.index);
        let v_bound = binding.bound.is_set(self.variable_v.index);

        let e_var = self.variable_e.index == variable;
        let a_var = self.variable_a.index == variable;
        let v_var = self.variable_v.index == variable;

        if let Some(trible) = Trible::new_raw_values(
            binding.get(self.variable_e.index).unwrap_or([0; 32]),
            binding.get(self.variable_a.index).unwrap_or([0; 32]),
            binding.get(self.variable_v.index).unwrap_or([0; 32]),
        ) {
            match (e_bound, a_bound, v_bound, e_var, a_var, v_var) {
                (false, false, false, true, false, false) => {
                    self.set.eav.infixes(trible.data, E_START, E_END, |k| {
                        Trible::new_raw(k).e_as_value()
                    })
                }
                (false, false, false, false, true, false) => {
                    self.set.aev.infixes(trible.data, A_START, A_END, |k| {
                        Trible::new_raw(k).a_as_value()
                    })
                }
                (false, false, false, false, false, true) => {
                    self.set
                        .vea
                        .infixes(trible.data, V_START, V_END, |k| Trible::new_raw(k).v())
                }

                (true, false, false, false, true, false) => {
                    self.set.eav.infixes(trible.data, A_START, A_END, |k| {
                        Trible::new_raw(k).a_as_value()
                    })
                }
                (true, false, false, false, false, true) => {
                    self.set
                        .eva
                        .infixes(trible.data, V_START, V_END, |k| Trible::new_raw(k).v())
                }

                (false, true, false, true, false, false) => {
                    self.set.aev.infixes(trible.data, E_START, E_END, |k| {
                        Trible::new_raw(k).e_as_value()
                    })
                }
                (false, true, false, false, false, true) => {
                    self.set
                        .ave
                        .infixes(trible.data, V_START, V_END, |k| Trible::new_raw(k).v())
                }

                (false, false, true, true, false, false) => {
                    self.set.vea.infixes(trible.data, E_START, E_END, |k| {
                        Trible::new_raw(k).e_as_value()
                    })
                }
                (false, false, true, false, true, false) => {
                    self.set.vae.infixes(trible.data, A_START, A_END, |k| {
                        Trible::new_raw(k).a_as_value()
                    })
                }

                (false, true, true, true, false, false) => {
                    self.set.ave.infixes(trible.data, E_START, E_END, |k| {
                        Trible::new_raw(k).e_as_value()
                    })
                }
                (true, false, true, false, true, false) => {
                    self.set.eva.infixes(trible.data, A_START, A_END, |k| {
                        Trible::new_raw(k).a_as_value()
                    })
                }
                (true, true, false, false, false, true) => {
                    self.set
                        .eav
                        .infixes(trible.data, V_START, V_END, |k| Trible::new_raw(k).v())
                }
                _ => panic!(),
            }
        } else {
            vec![]
        }
    }

    fn confirm(&self, variable: VariableId, binding: Binding, proposals: &mut Vec<Value>) {
        let e_bound = binding.bound.is_set(self.variable_e.index);
        let a_bound = binding.bound.is_set(self.variable_a.index);
        let v_bound = binding.bound.is_set(self.variable_v.index);

        let e_var = self.variable_e.index == variable;
        let a_var = self.variable_a.index == variable;
        let v_var = self.variable_v.index == variable;

        match (e_bound || e_var, a_bound || a_var, v_bound || v_var) {
            (false, false, false) => panic!(),
            (true, false, false) => {
                proposals.retain(|value| {
                    if let Some(trible) = Trible::new_raw_values(
                        binding.get(self.variable_e.index).unwrap_or(if e_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_a.index).unwrap_or(if a_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_v.index).unwrap_or(if v_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                    ) {
                        self.set.eav.has_prefix(trible.data, E_END)
                    } else {
                        false
                    }
                });
            }
            (false, true, false) => {
                proposals.retain(|value| {
                    if let Some(trible) = Trible::new_raw_values(
                        binding.get(self.variable_e.index).unwrap_or(if e_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_a.index).unwrap_or(if a_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_v.index).unwrap_or(if v_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                    ) {
                        self.set.aev.has_prefix(trible.data, A_END)
                    } else {
                        false
                    }
                });
            }
            (false, false, true) => {
                proposals.retain(|value| {
                    if let Some(trible) = Trible::new_raw_values(
                        binding.get(self.variable_e.index).unwrap_or(if e_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_a.index).unwrap_or(if a_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_v.index).unwrap_or(if v_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                    ) {
                        self.set.vea.has_prefix(trible.data, V_END)
                    } else {
                        false
                    }
                });
            }

            (true, true, false) => {
                proposals.retain(|value| {
                    if let Some(trible) = Trible::new_raw_values(
                        binding.get(self.variable_e.index).unwrap_or(if e_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_a.index).unwrap_or(if a_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_v.index).unwrap_or(if v_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                    ) {
                        self.set.eav.has_prefix(trible.data, A_END)
                    } else {
                        false
                    }
                });
            }
            (true, false, true) => {
                proposals.retain(|value| {
                    if let Some(trible) = Trible::new_raw_values(
                        binding.get(self.variable_e.index).unwrap_or(if e_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_a.index).unwrap_or(if a_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_v.index).unwrap_or(if v_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                    ) {
                        self.set.eva.has_prefix(trible.data, V_END)
                    } else {
                        false
                    }
                });
            }

            (false, true, true) => {
                proposals.retain(|value| {
                    if let Some(trible) = Trible::new_raw_values(
                        binding.get(self.variable_e.index).unwrap_or(if e_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_a.index).unwrap_or(if a_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_v.index).unwrap_or(if v_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                    ) {
                        self.set.ave.has_prefix(trible.data, V_END)
                    } else {
                        false
                    }
                });
            }

            (true, true, true) => {
                proposals.retain(|value| {
                    if let Some(trible) = Trible::new_raw_values(
                        binding.get(self.variable_e.index).unwrap_or(if e_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_a.index).unwrap_or(if a_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                        binding.get(self.variable_v.index).unwrap_or(if v_var {
                            *value
                        } else {
                            [0; 32]
                        }),
                    ) {
                        self.set.eav.has_prefix(trible.data, V_END)
                    } else {
                        false
                    }
                });
            }
        }
    }
}
*/


/** A tribleset is an immutably persistent datastructure that stores tribles with set semantics.
 * It supports efficient set operations often take sub-linear time.
 */
export class TribleSet {
  constructor(
    EAV = emptyEAVTriblePact,
    EVA = emptyEVATriblePact,
    AEV = emptyAEVTriblePact,
    AVE = emptyAVETriblePact,
    VEA = emptyVEATriblePact,
    VAE = emptyVAETriblePact,
  ) {
    this.EAV = EAV;
    this.EVA = EVA;
    this.AEV = AEV;
    this.AVE = AVE;
    this.VEA = VEA;
    this.VAE = VAE;
  }

  /**
   * Returns a new tribleset containting both the tribles of this set
   * and the tribles passed in.
   */
  with(tribles) {
    const EAV = this.EAV.batch();
    const EVA = this.EVA.batch();
    const AEV = this.AEV.batch();
    const AVE = this.AVE.batch();
    const VEA = this.VEA.batch();
    const VAE = this.VAE.batch();

    for (const trible of tribles) {
      const entry = new Entry(trible, undefined);

      EAV.put(entry);
      EVA.put(entry);
      AEV.put(entry);
      AVE.put(entry);
      VEA.put(entry);
      VAE.put(entry);
    }

    return new TribleSet(
      EAV.complete(),
      EVA.complete(),
      AEV.complete(),
      AVE.complete(),
      VEA.complete(),
      VAE.complete(),
    );
  }

  /**
   * Provides a way to dump all tribles this db in EAV lexicographic order.
   * @returns an array of tribles
   */
  tribles() {
    return this.EAV.infixes((k) => k);
  }

  /**
   * Returns a single trible constraint ensuring that there exists a corresponding
   * eav trible in this set for the passed e, a and v variables.
   */
  tripleConstraint([e, a, v]) {
    return new TribleConstraint(this, e.index, a.index, v.index);
  }

  /**
   * Returns a constraint ensuring that there is a corresponding trible in this
   * tribleset for each triple passed in the pattern.
   * This is equivalent to performing an `and`/conjunction over multiple tripleConstraint
   * calls, but allows for a potentially more efficient execution (see commits).
   */
  patternConstraint(triples) {
    return and(
      ...triples.map(([e, a, v]) =>
        new TribleConstraint(this, e.index, a.index, v.index)
      ),
    );
  }

  /**
   * @returns The number of tribles stored in this set.
   */
  count() {
    return this.EAV.count();
  }

  /**
   * @returns A tribleset of the same type as this one with all contents removed.
   */
  empty() {
    return new TribleSet();
  }

  /**
   * @returns A bool indicating if this tribleset contains any tribles.
   */
  isEmpty() {
    return this.EAV.isEmpty();
  }

  /**
   * Compares two triblesets and returns wether they are equal.
   */
  isEqual(other) {
    return this.EAV.isEqual(other.EAV);
  }
  /**
   * Checks if this tribleset is a subset of the passed tribleset,
   * i.e. if every trible of this set is also contained in the passed set.
   */
  /*
  isSubsetOf(other) {
    return this.EAV.isSubsetOf(other.indexE);
  }
  */

  /**
   * Checks if this tribleset has an intersection with the passed set,
   * i.e. if there exists a trible that is contained in both sets.
   */
  /*
  isIntersecting(other) {
    return this.EAV.isIntersecting(other.indexE);
  }
  */

  /**
   * Returns a new tribleset that is the union of this set and the passed set,
   * i.e. a set that contains any trible that is in either of the input sets.
   */
  union(other) {
    return new TribleSet(
      this.EAV.union(other.EAV),
      this.EVA.union(other.EVA),
      this.AEV.union(other.AEV),
      this.AVE.union(other.AVE),
      this.VEA.union(other.VEA),
      this.VAE.union(other.VAE),
    );
  }

  /**
   * Returns a new tribleset that contains the tribles of this set
   * with the tribles of the passed set subtracted,
   * i.e. a set that contains any trible that is in this set but not in the passed set.
   */
  /*
  subtract(other) {
    return new TribleSet(
      this.EAV.subtract(other.EAV),
      this.EVA.subtract(other.EVA),
      this.AEV.subtract(other.AEV),
      this.AVE.subtract(other.AVE),
      this.VEA.subtract(other.VEA),
      this.VAE.subtract(other.VAE),
    );
  }
  */
  /**
   * Returns a new tribleset that contains the difference of this set and
   * the passed set, i.e. a set that contains any trible that is in one of
   * the sets but not in the other.
   */
  /*
  difference(other) {
    return new TribleSet(
      this.EAV.difference(other.EAV),
      this.EVA.difference(other.EVA),
      this.AEV.difference(other.AEV),
      this.AVE.difference(other.AVE),
      this.VEA.difference(other.VEA),
      this.VAE.difference(other.VAE),
    );
  }
  */
  /**
   * Returns a new tribleset that contains the intersection of this set and
   * the passed set, i.e. a set that contains any trible that is in both of
   * the sets.
   */
  /*
  intersect(other) {
    return new TribleSet(
      this.EAV.intersect(other.EAV),
      this.EVA.intersect(other.EVA),
      this.AEV.intersect(other.AEV),
      this.AVE.intersect(other.AVE),
      this.VEA.intersect(other.VEA),
      this.VAE.intersect(other.VAE),
    );
  }
  */
}
