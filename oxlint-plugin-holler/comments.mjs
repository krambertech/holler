export const BASELINE = "scripts/comment-baseline.json";

export const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export const GENERATED =
  /(^|\/)(worker-configuration\.d\.ts|[^/]*\.gen\.(ts|tsx|js|mjs))$|(^|\/)(dist|dist-design|public|migrations|node_modules)\/|^packages\/core\/src\/schema\/auth\.ts$/;

const TOOL_DIRECTIVE =
  /^(\/\/\/?|\/\*\*?)\s*(oxlint-(disable|enable)(-next-line|-line)?\b|oxfmt-ignore\b|prettier-ignore\b|@ts-(expect-error|ignore|nocheck|check)\b|check-styling: allow\b|<reference\s)/;
const BARE_DIRECTIVE =
  /^\/\*\*?\s*([@#]__PURE__|@vite-ignore|@internal|(@vitest-environment|@jsxImportSource)\s+\S+)\s*\*\/$/;
const TYPE_TAG = /^\/\*\*\s*@(type|typedef|satisfies)\s*\{/;

export function isDirective(text) {
  return TOOL_DIRECTIVE.test(text) || BARE_DIRECTIVE.test(text) || TYPE_TAG.test(text);
}
