import { indexConstraint, IntersectionConstraint, Query } from "./query.js";
import { emptyValuePACT } from "./pact.js";
import { equalValue } from "./trible.js";

export const id = Symbol("id");

const prebuild_cache = new WeakMap();

export function buildNamespace(ns) {
  if (prebuild_cache.has(ns)) {
    return prebuild_cache.get(ns);
  }

  const attributes = new Map(); // attribute name -> attribute description
  let forwardAttributeIndex = emptyValuePACT; // non inverse attribute id -> [attribute description]
  let inverseAttributeIndex = emptyValuePACT; // inverse attribute id -> [attribute description],

  const idDescription = ns[id];
  if (!idDescription) {
    throw Error(`Incomplete namespace: Missing [id] field.`);
  }
  if (!idDescription.decoder) {
    throw Error(`Incomplete namespace: Missing [id] decoder.`);
  }
  if (!idDescription.encoder) {
    throw Error(`Incomplete namespace: Missing [id] encoder.`);
  }
  if (!idDescription.factory) {
    throw Error(`Incomplete namespace: Missing [id] factory.`);
  }

  for (const [attributeName, attributeDescription] of Object.entries(ns)) {
    if (attributeDescription.isInverse && !attributeDescription.isLink) {
      throw Error(
        `Bad options in namespace attribute ${attributeName}:
              Only links can be inversed.`,
      );
    }
    if (!attributeDescription.isLink && !attributeDescription.decoder) {
      throw Error(
        `Missing decoder in namespace for attribute ${attributeName}.`,
      );
    }
    if (!attributeDescription.isLink && !attributeDescription.encoder) {
      throw Error(
        `Missing encoder in namespace for attribute ${attributeName}.`,
      );
    }
    const description = {
      ...attributeDescription,
      name: attributeName,
    };
    attributes.set(attributeName, description);
    if (description.isInverse) {
      inverseAttributeIndex = inverseAttributeIndex.put(description.id, [
        ...(inverseAttributeIndex.get(description.id) || []),
        description,
      ]);
    } else {
      forwardAttributeIndex = forwardAttributeIndex.put(description.id, [
        ...(forwardAttributeIndex.get(description.id) || []),
        description,
      ]);
    }
  }

  for (const [_, attributeDescription] of attributes) {
    if (attributeDescription.isLink) {
      attributeDescription.encoder = idDescription.encoder;
      attributeDescription.decoder = idDescription.decoder;
    }
  }

  const build_ns = {
    ids: idDescription,
    attributes,
    forwardAttributeIndex,
    inverseAttributeIndex,
  };

  prebuild_cache.set(ns, build_ns);
  return build_ns;
}

export function validateNS(ns, middleware = (commits) => commits) {
  const newUniqueAttributeIndex = emptyValuePACT.batch();
  const newUniqueInverseAttributeIndex = emptyValuePACT.batch();

  const build_ns = buildNamespace(ns);

  for (
    const {
      id: encodedId,
      isMany,
      isInverse,
    } of build_ns.attributes.values()
  ) {
    if (!isMany) {
      if (isInverse) {
        newUniqueInverseAttributeIndex.put(encodedId);
      } else {
        newUniqueAttributeIndex.put(encodedId);
      }
    }
  }

  const uniqueAttributeIndex = newUniqueAttributeIndex.complete();
  const uniqueInverseAttributeIndex = newUniqueInverseAttributeIndex.complete();

  return function* (commits) {
    for (const commit of middleware(commits)) {
      for (
        const r of new Query(
          new IntersectionConstraint([
            indexConstraint(1, uniqueAttributeIndex),
            commit.commitKB.tribleset.patternConstraint([[0, 1, 2]]),
            commit.currentKB.tribleset.patternConstraint([[0, 1, 3]]),
          ]),
        )
      ) {
        if (!equalValue(r.get(2), r.get(3))) {
          throw Error(
            `constraint violation: multiple values for unique attribute`,
          );
        }
      }

      for (
        const r of new Query(
          new IntersectionConstraint([
            indexConstraint(1, uniqueInverseAttributeIndex),
            commit.commitKB.tribleset.patternConstraint([[2, 1, 0]]),
            commit.currentKB.tribleset.patternConstraint([[3, 1, 0]]),
          ]),
        )
      ) {
        if (!equalValue(r.get(2), r.get(3))) {
          throw Error(
            `constraint violation: multiple entities for unique attribute value`,
          );
        }
      }
      yield commit;
    }
  };
}
