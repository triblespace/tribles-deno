import { ByteBitset } from "../bitset.ts";
import { Binding, Variable } from "../query.ts";
import {
  A,
  A_END,
  A_START,
  E,
  E_END,
  E_START,
  idToValue,
  tribleFromValues,
  V,
  V_END,
  V_START,
  Value,
  zeroValue,
} from "../trible.ts";
import { TribleSet } from "../tribleset.ts";
import { filterInPlace } from "../util.ts";
import { Constraint } from "./constraint.ts";

/**
 * A constraint limits the passed variables e, a and v to values with
 * a corresponding eav trible existing in the passed tribleset.
 */
export class TribleConstraint implements Constraint {
  set: TribleSet;

  eVar: Variable<unknown>;
  aVar: Variable<unknown>;
  vVar: Variable<unknown>;

  constructor(
    tribleSet: TribleSet,
    e: Variable<unknown>,
    a: Variable<unknown>,
    v: Variable<unknown>,
  ) {
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
      binding.get(this.vVar.index) ?? zeroValue,
    );
    if (trible === undefined) return 0;

    if (!e_ && !a_ && !v_ && $e && !$a && !$v) {
      return this.set.EAV.prefixSegmentCount(trible, E_START);
    }
    if (!e_ && !a_ && !v_ && !$e && $a && !$v) {
      return this.set.AEV.prefixSegmentCount(trible, A_START);
    }
    if (!e_ && !a_ && !v_ && !$e && !$a && $v) {
      return this.set.VEA.prefixSegmentCount(trible, V_START);
    }
    if (e_ && !a_ && !v_ && !$e && $a && !$v) {
      return this.set.EAV.prefixSegmentCount(trible, A_START);
    }
    if (e_ && !a_ && !v_ && !$e && !$a && $v) {
      return this.set.EVA.prefixSegmentCount(trible, V_START);
    }
    if (!e_ && a_ && !v_ && $e && !$a && !$v) {
      return this.set.AEV.prefixSegmentCount(trible, E_START);
    }
    if (!e_ && a_ && !v_ && !$e && !$a && $v) {
      return this.set.AVE.prefixSegmentCount(trible, V_START);
    }
    if (!e_ && !a_ && v_ && $e && !$a && !$v) {
      return this.set.VEA.prefixSegmentCount(trible, E_START);
    }
    if (!e_ && !a_ && v_ && !$e && $a && !$v) {
      return this.set.VAE.prefixSegmentCount(trible, A_START);
    }
    if (!e_ && a_ && v_ && $e && !$a && !$v) {
      return this.set.AVE.prefixSegmentCount(trible, E_START);
    }
    if (e_ && !a_ && v_ && !$e && $a && !$v) {
      return this.set.EVA.prefixSegmentCount(trible, A_START);
    }
    if (e_ && a_ && !v_ && !$e && !$a && $v) {
      return this.set.EAV.prefixSegmentCount(trible, V_START);
    }
    throw Error(`invalid state ${[e_, a_, v_, $e, $a, $v]}`);
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
      v_ ?? zeroValue,
    );
    if (trible === undefined) return [];

    if (!e_ && !a_ && !v_ && $e && !$a && !$v) {
      return this.set.EAV.infixes(
        (key) => idToValue(E(key)),
        trible,
        E_START,
        E_END,
      );
    }
    if (!e_ && !a_ && !v_ && !$e && $a && !$v) {
      return this.set.AEV.infixes(
        (key) => idToValue(A(key)),
        trible,
        A_START,
        A_END,
      );
    }
    if (!e_ && !a_ && !v_ && !$e && !$a && $v) {
      return this.set.VEA.infixes(
        (key) => V(key),
        trible,
        V_START,
        V_END,
      );
    }
    if (e_ && !a_ && !v_ && !$e && $a && !$v) {
      return this.set.EAV.infixes(
        (key) => idToValue(A(key)),
        trible,
        A_START,
        A_END,
      );
    }
    if (e_ && !a_ && !v_ && !$e && !$a && $v) {
      return this.set.EVA.infixes(
        (key) => V(key),
        trible,
        V_START,
        V_START,
      );
    }
    if (!e_ && a_ && !v_ && $e && !$a && !$v) {
      return this.set.AEV.infixes(
        (key) => idToValue(E(key)),
        trible,
        E_START,
        E_END,
      );
    }
    if (!e_ && a_ && !v_ && !$e && !$a && $v) {
      return this.set.AVE.infixes(
        (key) => V(key),
        trible,
        V_START,
        V_END,
      );
    }
    if (!e_ && !a_ && v_ && $e && !$a && !$v) {
      return this.set.VEA.infixes(
        (key) => idToValue(E(key)),
        trible,
        E_START,
        E_END,
      );
    }
    if (!e_ && !a_ && v_ && !$e && $a && !$v) {
      return this.set.VAE.infixes(
        (key) => idToValue(A(key)),
        trible,
        A_START,
        A_END,
      );
    }
    if (!e_ && a_ && v_ && $e && !$a && !$v) {
      return this.set.AVE.infixes(
        (key) => idToValue(E(key)),
        trible,
        E_START,
        E_END,
      );
    }
    if (e_ && !a_ && v_ && !$e && $a && !$v) {
      return this.set.EVA.infixes(
        (key) => idToValue(A(key)),
        trible,
        A_START,
        A_END,
      );
    }
    if (e_ && a_ && !v_ && !$e && !$a && $v) {
      return this.set.EAV.infixes(
        (key) => V(key),
        trible,
        V_START,
        V_END,
      );
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

    if (!e_ && !a_ && !v_ && $e && !$a && !$v) {
      filterInPlace(proposals, (value) => {
        const trible = tribleFromValues(value, zeroValue, zeroValue);
        if (trible === undefined) return false;
        return this.set.EAV.hasPrefix(trible, E_END);
      });
      return;
    }
    if (!e_ && !a_ && !v_ && !$e && $a && !$v) {
      filterInPlace(proposals, (value) => {
        const trible = tribleFromValues(zeroValue, value, zeroValue);
        if (trible === undefined) return false;
        return this.set.AEV.hasPrefix(trible, A_END);
      });
      return;
    }
    if (!e_ && !a_ && !v_ && !$e && !$a && $v) {
      filterInPlace(proposals, (value) => {
        const trible = tribleFromValues(zeroValue, zeroValue, value);
        if (trible === undefined) return false;
        return this.set.VEA.hasPrefix(trible, V_END);
      });
      return;
    }
    if (e_ && !a_ && !v_ && !$e && $a && !$v) {
      filterInPlace(proposals, (value) => {
        const trible = tribleFromValues(e_, value, zeroValue);
        if (trible === undefined) return false;
        return this.set.EAV.hasPrefix(trible, A_END);
      });
      return;
    }
    if (e_ && !a_ && !v_ && !$e && !$a && $v) {
      filterInPlace(proposals, (value) => {
        const trible = tribleFromValues(e_, zeroValue, value);
        if (trible === undefined) return false;
        return this.set.EVA.hasPrefix(trible, V_END);
      });
      return;
    }
    if (!e_ && a_ && !v_ && $e && !$a && !$v) {
      filterInPlace(proposals, (value) => {
        const trible = tribleFromValues(value, a_, zeroValue);
        if (trible === undefined) return false;
        return this.set.AEV.hasPrefix(trible, E_END);
      });
      return;
    }
    if (!e_ && a_ && !v_ && !$e && !$a && $v) {
      filterInPlace(proposals, (value) => {
        const trible = tribleFromValues(zeroValue, a_, value);
        if (trible === undefined) return false;
        return this.set.AVE.hasPrefix(trible, V_END);
      });
      return;
    }
    if (!e_ && !a_ && v_ && $e && !$a && !$v) {
      filterInPlace(proposals, (value) => {
        const trible = tribleFromValues(value, zeroValue, v_);
        if (trible === undefined) return false;
        return this.set.VEA.hasPrefix(trible, E_END);
      });
      return;
    }
    if (!e_ && !a_ && v_ && !$e && $a && !$v) {
      filterInPlace(proposals, (value) => {
        const trible = tribleFromValues(zeroValue, value, v_);
        if (trible === undefined) return false;
        return this.set.VAE.hasPrefix(trible, A_END);
      });
      return;
    }
    if (!e_ && a_ && v_ && $e && !$a && !$v) {
      filterInPlace(proposals, (value) => {
        const trible = tribleFromValues(value, a_, v_);
        if (trible === undefined) return false;
        return this.set.AVE.hasPrefix(trible, E_END);
      });
      return;
    }
    if (e_ && !a_ && v_ && !$e && $a && !$v) {
      filterInPlace(proposals, (value) => {
        const trible = tribleFromValues(e_, value, v_);
        if (trible === undefined) return false;
        return this.set.EVA.hasPrefix(trible, A_END);
      });
      return;
    }
    if (e_ && a_ && !v_ && !$e && !$a && $v) {
      filterInPlace(proposals, (value) => {
        const trible = tribleFromValues(e_, a_, value);
        if (trible === undefined) return false;
        return this.set.EAV.hasPrefix(trible, V_END);
      });
      return;
    }
    throw Error("invalid state");
  }
}
