// How the audience picker matches what was typed against the Slack directory. The server ranks
// with it before it cuts the list, and the picker ranks with it again as results arrive, so
// both doors agree on what comes first.

/** Letters that carry no accent to strip but still have a plain Latin spelling. */
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

/**
 * Folds text for search in any script: lowercase, accents off ("Tomás" finds "tomas"), and
 * hyphens, dots and underscores read as spaces, so "design-team" has two words. JavaScript does
 * this because SQLite's lower() is ASCII-only. Scripts without case or accents pass through.
 */
export function foldText(text: string): string {
  return (
    text
      .toLowerCase()
      // NFKD splits é into e and its accent, and full-width letters into plain ones.
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[ßæœøłđðþı]/g, (letter) => PLAIN[letter] ?? letter)
      .replace(/['’ʼ]/g, "")
      .replace(/[\s\-_./·]+/g, " ")
      // Back together: Hangul syllables and kana with their voicing marks.
      .normalize("NFC")
      .trim()
  );
}

/** The folded text stored in `search_name`, from every name a person or group goes by. */
export function foldForSearch(...parts: (string | null | undefined)[]): string {
  return foldText(parts.filter((part): part is string => Boolean(part)).join(" "));
}

/** What a search is for: anything, handles (`@mira`, `@design-team`), or channels (`#product`). */
export type SearchScope = "all" | "handles" | "channels";

export interface SearchQuery {
  /** Folded words, at most five, each matched anywhere in a name. */
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

/**
 * How well a name matches, best first: 0 the whole name; 1 its first words ("ana" in "Ana
 * Lima"); 2 its start ("ana" in "Anastasia"); 3 the start of a later word ("kask" in "Mira
 * Kask"); 4 inside a word. Null when a word typed is missing.
 */
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

/** What ranking needs to know about one result. */
export interface Rankable {
  /** Every name it goes by: a person's name and Slack handle, a group's name and handle. */
  names: readonly (string | null | undefined)[];
  /** How many of the sender's hollers it was in. Ties go to the one they send to more. */
  sends: number;
  /** The name to sort by when everything else ties. */
  label: string;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/**
 * The matches for what was typed, best first: a better match, then the one the sender sends to
 * more, then by name. Anything that does not match is left out.
 */
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
