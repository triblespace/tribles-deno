import { ByteBitset } from "../bitset.ts";
import { Binding, Variable } from "../query.ts";
import { tribleFromValues } from "../trible.ts";
import { TribleSet } from "../tribleset.ts";
import { fixedUint8Array } from "../util.ts";
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
      const e = bound.has(this.eVar.index);
      const a = bound.has(this.aVar.index);
      const v = bound.has(this.vVar.index);
  
      if (e && a && v) {
        throw Error("estimate for fulfilled constraint");
      }

      const $e = this.eVar.index === variable_index;
      const $a = this.aVar.index === variable_index;
      const $v = this.vVar.index === variable_index;
  
      const trible = tribleFromValues(
                        binding.get(this.eVar.index),
                        binding.get(this.aVar.index),
                        binding.get(this.vVar.index));
      if(trible === undefined) return 0;

      if (e && a && !v && $v) {
        return eav.estimate(binding.get(this.eVar.index), binding.get(this.aVar.index));
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

    /*
    fn estimate(&self, variable: VariableId, binding: Binding) -> usize {
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
    }
    */
  
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