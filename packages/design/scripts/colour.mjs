// Reads packages/design/tokens.css and turns its OKLCH colours into sRGB hex and WCAG contrast.
// scripts/check-design.mjs and src/contrast.test.ts both use it, so the two never disagree.

export const LIGHT = ':root,\n[data-theme="light"]';
export const DARK = '[data-theme="dark"]';
export const OS_DARK = ':root:not([data-theme="light"])';

/** The custom properties declared directly inside the first block that opens with `selector {`. */
export function block(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`tokens.css has no block for ${selector}`);
  // The OS dark block sits inside @media, one level in.
  const end = css.indexOf(selector === OS_DARK ? "\n  }" : "\n}", start);
  const body = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
  return Object.fromEntries(
    [...body.matchAll(/^\s*--([a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]),
  );
}

const NUMBER = String.raw`(-?[\d.]+)`;
const OKLCH = new RegExp(
  String.raw`^oklch\(\s*${NUMBER}\s+${NUMBER}\s+${NUMBER}\s*(?:\/\s*${NUMBER}\s*)?\)$`,
);

/** A colour as OKLab with alpha, from oklch() or var(). Undefined for anything that is not a colour. */
export function parse(value, vars = {}, seen = []) {
  const v = value.trim();
  const ref = v.match(/^var\(--([a-z0-9-]+)\)$/);
  if (ref) {
    if (seen.includes(ref[1]) || !(ref[1] in vars)) throw new Error(`Cannot resolve ${v}`);
    return parse(vars[ref[1]], vars, [...seen, ref[1]]);
  }
  const lch = v.match(OKLCH);
  if (!lch) return undefined;
  const [L, C, H] = lch.slice(1, 4).map(Number);
  return {
    L,
    a: C * Math.cos((H * Math.PI) / 180),
    b: C * Math.sin((H * Math.PI) / 180),
    alpha: lch[4] === undefined ? 1 : Number(lch[4]),
  };
}

function linearRgb({ L, a, b }) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((x) => Math.min(1, Math.max(0, x)));
}

const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const decode = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);

/** sRGB hex, with alpha as a fourth byte when the colour is translucent. */
export function hex(colour) {
  const bytes = linearRgb(colour).map((x) => Math.round(encode(x) * 255));
  if (colour.alpha < 1) bytes.push(Math.round(colour.alpha * 255));
  return `#${bytes.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** The colour as sRGB 0–1 after laying it over an opaque background. */
function over(colour, background) {
  const top = linearRgb(colour).map(encode);
  const bottom = linearRgb(background).map(encode);
  return top.map((t, i) => t * colour.alpha + bottom[i] * (1 - colour.alpha));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map(decode);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of a foreground over an opaque background. */
export function contrast(foreground, background) {
  const bg = linearRgb(background).map(encode);
  const fg = over(foreground, background);
  const [x, y] = [luminance(fg), luminance(bg)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Every token of a theme, with tokens a theme does not redeclare taken from the light one. */
export function themes(css) {
  const light = block(css, LIGHT);
  return { light, dark: { ...light, ...block(css, DARK) } };
}

/** Light colour tokens in declaration order, as hex, for DESIGN.md's frontmatter. */
export function palette(css) {
  const light = block(css, LIGHT);
  return Object.keys(light)
    .map((name) => [name, parse(light[name], light)])
    .filter(([, colour]) => colour)
    .map(([name, colour]) => [name, hex(colour)]);
}
