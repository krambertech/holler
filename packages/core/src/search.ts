const PLAIN: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
};

export function foldText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ßæœøłđðþı]/g, (letter) => PLAIN[letter] ?? letter)
    .replace(/['’ʼ]/g, "")
    .replace(/[\s\-_./·]+/g, " ")
    .normalize("NFC")
    .trim();
}

export function foldForSearch(...parts: (string | null | undefined)[]): string {
  return foldText(parts.filter((part): part is string => Boolean(part)).join(" "));
}

export type SearchScope = "all" | "handles" | "channels";

export interface SearchQuery {
  tokens: string[];
  scope: SearchScope;
}

const MAX_TOKENS = 5;
const MAX_TOKEN_LENGTH = 40;

export function parseSearch(query: string): SearchQuery {
  const trimmed = query.trim();
  const scope: SearchScope = trimmed.startsWith("#")
    ? "channels"
    : trimmed.startsWith("@")
      ? "handles"
      : "all";
  const words = foldText(trimmed.replace(/(^|\s)[@#]+/g, "$1"))
    .split(" ")
    .filter(Boolean)
    .map((word) => word.slice(0, MAX_TOKEN_LENGTH));
  return { tokens: [...new Set(words)].slice(0, MAX_TOKENS), scope };
}

export type MatchTier = 0 | 1 | 2 | 3 | 4;

export function matchTier(
  names: readonly (string | null | undefined)[],
  tokens: readonly string[],
): MatchTier | null {
  const folded = names.filter((name): name is string => Boolean(name)).map(foldText);
  if (tokens.length === 0) return 4;
  const all = folded.join(" ");
  if (!tokens.every((token) => all.includes(token))) return null;
  const phrase = tokens.join(" ");
  if (folded.some((name) => name === phrase)) return 0;
  if (folded.some((name) => name.startsWith(`${phrase} `))) return 1;
  if (folded.some((name) => name.startsWith(phrase))) return 2;
  const words = all.split(" ");
  if (tokens.every((token) => words.some((word) => word.startsWith(token)))) return 3;
  return 4;
}

export interface Rankable {
  names: readonly (string | null | undefined)[];
  sends: number;
  label: string;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export function rankMatches<T>(
  items: readonly T[],
  tokens: readonly string[],
  rankable: (item: T) => Rankable,
): T[] {
  return items
    .map((item) => {
      const about = rankable(item);
      return { item, about, tier: matchTier(about.names, tokens) };
    })
    .filter((row): row is typeof row & { tier: MatchTier } => row.tier !== null)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        b.about.sends - a.about.sends ||
        collator.compare(a.about.label, b.about.label),
    )
    .map((row) => row.item);
}
