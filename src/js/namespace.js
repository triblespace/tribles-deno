export const id = Symbol("id");

const prebuild_cache = new WeakMap();

export function buildNS(ns) {
    if(prebuild_cache.has(ns)) {
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
              Only links can be inversed.`
        );
      }
      if (!attributeDescription.isLink && !attributeDescription.decoder) {
        throw Error(
          `Missing decoder in namespace for attribute ${attributeName}.`
        );
      }
      if (!attributeDescription.isLink && !attributeDescription.encoder) {
        throw Error(
          `Missing encoder in namespace for attribute ${attributeName}.`
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
  
    const build_ns = { ids: idDescription, attributes, forwardAttributeIndex, inverseAttributeIndex };

    prebuild_cache.set(ns, build_ns);
    return build_ns;
  }
  