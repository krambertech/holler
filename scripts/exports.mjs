// The names a TypeScript or Astro source exports, read one way by check-design and check-design-coverage.

const DECLARED =
  /export\s+(?:default\s+)?(?:async\s+)?(const|let|function|class|type|interface)\s+([A-Za-z_$][\w$]*)/g;
const LISTED = /export\s+(type\s+)?\{([^}]*)\}/g;

/**
 * Every name a source exports, by its public name: declarations and `export { … }` lists. With
 * `types: false`, type-only exports are left out.
 */
export function exportedNames(source, { types = true } = {}) {
  const names = [];
  for (const [, kind, name] of source.matchAll(DECLARED))
    if (types || (kind !== "type" && kind !== "interface")) names.push(name);
  for (const [, typeList, list] of source.matchAll(LISTED)) {
    if (typeList && !types) continue;
    for (const part of list.split(",")) {
      const entry = part.trim();
      if (!entry || (entry.startsWith("type ") && !types)) continue;
      names.push(
        entry
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)
          .pop(),
      );
    }
  }
  return [...new Set(names)];
}
