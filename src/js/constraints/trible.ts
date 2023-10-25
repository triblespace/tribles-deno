import { ByteBitset } from "../bitset.ts";
import { Binding, Variable } from "../query.ts";
import { A, A_END, A_START, E, E_END, E_START, V, V_END, V_START, Value, idToValue, tribleFromValues, zeroValue } from "../trible.ts";
import { TribleSet } from "../tribleset.ts";
import { filterInPlace, fixedUint8Array } from "../util.ts";
import { Constraint } from "./constraint.ts";

/**
 * A constraint limits the passed variables e, a and v to values with
 * a corresponding eav trible existing in the passed tribleset.
 */
class TribleConstraint implements Constraint {
    set: TribleSet;
  
    eVar: Variable<unknown>;
    aVar: Variable<unknown>;
    vVar: Variable<unknown>;
  
    constructor(tribleSet: TribleSet, e: Variable<unknown>, a: Variable<unknown>, v: Variable<unknown>) {
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
      const bitset = new ByteBitset();
      bitset.set(this.eVar.index);
      bitset.set(this.aVar.index);
      bitset.set(this.vVar.index);
      return bitset;
    }
  
    estimate(variable_index: number, binding: Binding) {
        const bound = binding.bound();
        const e_ = bound.has(this.eVar.index);
        const a_ = bound.has(this.aVar.index);
        const v_ = bound.has(this.vVar.index);

        if (e_ && a_ && v_) {
            throw Error("estimate for fulfilled constraint");
        }

        const $e = this.eVar.index === variable_index;
        const $a = this.aVar.index === variable_index;
        const $v = this.vVar.index === variable_index;

        const trible = tribleFromValues(
                        binding.get(this.eVar.index) ?? zeroValue,
                        binding.get(this.aVar.index) ?? zeroValue,
                        binding.get(this.vVar.index) ?? zeroValue);
        if(trible === undefined) return 0;

        if(!e_ && !a_ && !v_ && $e && !$a && !$v) {
            return this.set.EAV.prefixSegmentCount(trible, E_START);
        }
        if(!e_ && !a_ && !v_ && !$e && $a && !$v) {
            return this.set.AEV.prefixSegmentCount(trible, A_START);
        }
        if(!e_ && !a_ && !v_ && !$e && !$a && $v) {
            return this.set.VEA.prefixSegmentCount(trible, V_START);
        }
        if(e_ && !a_ && !v_ && !$e && $a && !$v) {
            return this.set.EAV.prefixSegmentCount(trible, A_START);
        }
        if(e_ && !a_ && !v_ && !$e && !$a && $v) {
            return this.set.EVA.prefixSegmentCount(trible, V_START);
        }
        if(!e_ && a_ && !v_ && $e && !$a && !$v) {
            return this.set.AEV.prefixSegmentCount(trible, E_START);
        }
        if(!e_ && a_ && !v_ && !$e && !$a && $v) {
            return this.set.AVE.prefixSegmentCount(trible, V_START);
        }
        if(!e_ && !a_ && v_ && $e && !$a && !$v) {
            return this.set.VEA.prefixSegmentCount(trible, E_START);
        }
        if(!e_ && !a_ && v_ && !$e && $a && !$v) {
            return this.set.VAE.prefixSegmentCount(trible, A_START);
        }
        if(!e_ && a_ && v_ && $e && !$a && !$v) {
            return this.set.AVE.prefixSegmentCount(trible, E_START);
        }
        if(e_ && !a_ && v_ && !$e && $a && !$v) {
            return this.set.EVA.prefixSegmentCount(trible, A_START);
        }
        if(e_ && a_ && !v_ && !$e && !$a && $v) {
            return this.set.EAV.prefixSegmentCount(trible, V_START);
        }
        throw Error("invalid state");
    }
  
    propose(variable_index: number, binding: Binding): Value[] {
        const e_ = binding.get(this.eVar.index);
        const a_ = binding.get(this.aVar.index);
        const v_ = binding.get(this.vVar.index);

        const $e = this.eVar.index === variable_index;
        const $a = this.aVar.index === variable_index;
        const $v = this.vVar.index === variable_index;

        const trible = tribleFromValues(
                        e_ ?? zeroValue,
                        a_ ?? zeroValue,
                        v_ ?? zeroValue);
        if(trible === undefined) return [];

        if(!e_ && !a_ && !v_ && $e && !$a && !$v) {
            return this.set.EAV.infixes(
                (key) => idToValue(E(key)),
                trible, E_START, E_END);
        }
        if(!e_ && !a_ && !v_ && !$e && $a && !$v) {
            return this.set.AEV.infixes(
                (key) => idToValue(A(key)),
                trible, A_START, A_END);
        }
        if(!e_ && !a_ && !v_ && !$e && !$a && $v) {
            return this.set.VEA.infixes(
                (key) => V(key),
                trible, V_START, V_END);
        }
        if(e_ && !a_ && !v_ && !$e && $a && !$v) {
            return this.set.EAV.infixes(
                (key) => idToValue(A(key)),
                trible, A_START, A_END);
        }
        if(e_ && !a_ && !v_ && !$e && !$a && $v) {
            return this.set.EVA.infixes(
                (key) => V(key),
                trible, V_START, V_START);
        }
        if(!e_ && a_ && !v_ && $e && !$a && !$v) {
            return this.set.AEV.infixes(
                (key) => idToValue(E(key)),
                trible, E_START, E_END);
        }
        if(!e_ && a_ && !v_ && !$e && !$a && $v) {
            return this.set.AVE.infixes(
                (key) => V(key),
                trible, V_START, V_END);
        }
        if(!e_ && !a_ && v_ && $e && !$a && !$v) {
            return this.set.VEA.infixes(
                (key) => idToValue(E(key)),
                trible, E_START, E_END);
        }
        if(!e_ && !a_ && v_ && !$e && $a && !$v) {
            return this.set.VAE.infixes(
                (key) => idToValue(A(key)),
                trible, A_START, A_END);
        }
        if(!e_ && a_ && v_ && $e && !$a && !$v) {
            return this.set.AVE.infixes(
                (key) => idToValue(E(key)),
                trible, E_START, E_END);
        }
        if(e_ && !a_ && v_ && !$e && $a && !$v) {
            return this.set.EVA.infixes(
                (key) => idToValue(A(key)),
                trible, A_START, A_END);
        }
        if(e_ && a_ && !v_ && !$e && !$a && $v) {
            return this.set.EAV.infixes(
                (key) => V(key),
                trible, V_START, V_END);
        }
        throw Error("invalid state");
    }
  
    confirm(variable_index: number, binding: Binding, proposals: Value[]): void {
        const e_ = binding.get(this.eVar.index);
        const a_ = binding.get(this.aVar.index);
        const v_ = binding.get(this.vVar.index);

        const $e = this.eVar.index === variable_index;
        const $a = this.aVar.index === variable_index;
        const $v = this.vVar.index === variable_index;

        if(!e_ && !a_ && !v_ && $e && !$a && !$v) {
            filterInPlace(proposals, (value) => {
                const trible = tribleFromValues(value, zeroValue, zeroValue);
                if(trible === undefined) return false;
                return this.set.EAV.hasPrefix(trible, E_END)
            });
            return;
        }
        if(!e_ && !a_ && !v_ && !$e && $a && !$v) {
            filterInPlace(proposals, (value) => {
                const trible = tribleFromValues(zeroValue, value, zeroValue);
                if(trible === undefined) return false;
                return this.set.AEV.hasPrefix(trible, A_END)
            });
            return;
        }
        if(!e_ && !a_ && !v_ && !$e && !$a && $v) {
            filterInPlace(proposals, (value) => {
                const trible = tribleFromValues(zeroValue, zeroValue, value);
                if(trible === undefined) return false;
                return this.set.VEA.hasPrefix(trible, V_END)
            });
            return;
        }
        if(e_ && !a_ && !v_ && !$e && $a && !$v) {
            filterInPlace(proposals, (value) => {
                const trible = tribleFromValues(e_, value, zeroValue);
                if(trible === undefined) return false;
                return this.set.EAV.hasPrefix(trible, A_END)
            });
            return;
        }
        if(e_ && !a_ && !v_ && !$e && !$a && $v) {
            filterInPlace(proposals, (value) => {
                const trible = tribleFromValues(e_, zeroValue, value);
                if(trible === undefined) return false;
                return this.set.EVA.hasPrefix(trible, V_END)
            });
            return;
        }
        if(!e_ && a_ && !v_ && $e && !$a && !$v) {
            filterInPlace(proposals, (value) => {
                const trible = tribleFromValues(value, a_, zeroValue);
                if(trible === undefined) return false;
                return this.set.AEV.hasPrefix(trible, E_END)
            });
            return;
        }
        if(!e_ && a_ && !v_ && !$e && !$a && $v) {
            filterInPlace(proposals, (value) => {
                const trible = tribleFromValues(zeroValue, a_, value);
                if(trible === undefined) return false;
                return this.set.AVE.hasPrefix(trible, V_END)
            });
            return;
        }
        if(!e_ && !a_ && v_ && $e && !$a && !$v) {
            filterInPlace(proposals, (value) => {
                const trible = tribleFromValues(value, zeroValue, v_);
                if(trible === undefined) return false;
                return this.set.VEA.hasPrefix(trible, E_END)
            });
            return;
        }
        if(!e_ && !a_ && v_ && !$e && $a && !$v) {
            filterInPlace(proposals, (value) => {
                const trible = tribleFromValues(zeroValue, value, v_);
                if(trible === undefined) return false;
                return this.set.VAE.hasPrefix(trible, A_END)
            });
            return;
        }
        if(!e_ && a_ && v_ && $e && !$a && !$v) {
            filterInPlace(proposals, (value) => {
                const trible = tribleFromValues(value, a_, v_);
                if(trible === undefined) return false;
                return this.set.AVE.hasPrefix(trible, E_END)
            });
            return;
        }
        if(e_ && !a_ && v_ && !$e && $a && !$v) {
            filterInPlace(proposals, (value) => {
                const trible = tribleFromValues(e_, value, v_);
                if(trible === undefined) return false;
                return this.set.EVA.hasPrefix(trible, A_END)
            });
            return;
        }
        if(e_ && a_ && !v_ && !$e && !$a && $v) {
            filterInPlace(proposals, (value) => {
                const trible = tribleFromValues(e_, a_, value);
                if(trible === undefined) return false;
                return this.set.EAV.hasPrefix(trible, V_END)
            });
            return;
        }
        throw Error("invalid state");
    }
  }
  /*  
    fn confirm(&self, variable: VariableId, binding: Binding, proposals: &mut Vec<Value>) {
        let e_var = self.variable_e.index == variable;
        let a_var = self.variable_a.index == variable;
        let v_var = self.variable_v.index == variable;

        let e_bound = binding.get(self.variable_e.index);
        let a_bound = binding.get(self.variable_a.index);
        let v_bound = binding.get(self.variable_v.index);
        
        match (e_bound, a_bound, v_bound, e_var, a_var, v_var) {
            (None, None, None, true, false, false) =>
                proposals.retain(|value| {
                    if let Some(trible) = Trible::new_raw_values(*value, [0; 32],[0; 32]) {
                        self.set.eav.has_prefix(trible.data, E_END)
                    } else {
                        false
                    }
                }),
            (None, None, None, false, true, false) =>
                proposals.retain(|value| {
                    if let Some(trible) = Trible::new_raw_values([0; 32], *value, [0; 32]) {
                        self.set.aev.has_prefix(trible.data, A_END)
                    } else {
                        false
                    }
                }),
            (None, None, None, false, false, true) =>
                proposals.retain(|value| {
                    if let Some(trible) = Trible::new_raw_values([0; 32], [0; 32], *value) {
                        self.set.vea.has_prefix(trible.data, V_END)
                    } else {
                        false
                    }
                }),

            (Some(e), None, None, false, true, false) =>
            proposals.retain(|value| {
                if let Some(trible) = Trible::new_raw_values(e, *value, [0; 32]) {
                    self.set.eav.has_prefix(trible.data, A_END)
                } else {
                    false
                }
            }),
            (Some(e), None, None, false, false, true) =>
            proposals.retain(|value| {
                if let Some(trible) = Trible::new_raw_values(e, [0; 32], *value) {
                    self.set.eva.has_prefix(trible.data, V_END)
                } else {
                    false
                }
            }),
            (None, Some(a), None, true, false, false) =>
            proposals.retain(|value| {
                if let Some(trible) = Trible::new_raw_values([0; 32], a, *value) {
                    self.set.aev.has_prefix(trible.data, E_END)
                } else {
                    false
                }
            }),
            (None, Some(a), None, false, false, true) =>
            proposals.retain(|value| {
                if let Some(trible) = Trible::new_raw_values([0; 32], a, *value) {
                    self.set.ave.has_prefix(trible.data, V_END)
                } else {
                    false
                }
            }),
            (None, None, Some(v), true, false, false) =>
            proposals.retain(|value| {
                if let Some(trible) = Trible::new_raw_values(*value, [0; 32], v) {
                    self.set.vea.has_prefix(trible.data, E_END)
                } else {
                    false
                }
            }),
            (None, None, Some(v), false, true, false) =>
            proposals.retain(|value| {
                if let Some(trible) = Trible::new_raw_values([0; 32], *value, v) {
                    self.set.vae.has_prefix(trible.data, A_END)
                } else {
                    false
                }
            }),
            (None, Some(a), Some(v), true, false, false) =>
            proposals.retain(|value: &[u8; 32]| {
                if let Some(trible) = Trible::new_raw_values(*value, a, v) {
                    self.set.ave.has_prefix(trible.data, E_END)
                } else {
                    false
                }
            }),
            (Some(e), None, Some(v), false, true, false) =>
            proposals.retain(|value: &[u8; 32]| {
                if let Some(trible) = Trible::new_raw_values(e, *value, v) {
                    self.set.eva.has_prefix(trible.data, A_END)
                } else {
                    false
                }
            }),
            (Some(e), Some(a), None, false, false, true) =>
            proposals.retain(|value: &[u8; 32]| {
                if let Some(trible) = Trible::new_raw_values(e, a, *value) {
                    self.set.eav.has_prefix(trible.data, V_END)
                } else {
                    false
                }
            }),
            _ => panic!("invalid trible constraint state"),
        }
  */