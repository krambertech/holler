import { parseSearch, type Rankable, rankMatches } from "@holler/core";
import type { AudienceEntry, Resolved } from "./directory";

// The audience picker's rules, kept apart from React so each one has a test.

/** What ranking reads from a person or a group. Everyone is placed on its own. */
export function entryRankable(entry: AudienceEntry): Rankable {
  if (entry.kind === "person") {
    const { name, displayName, sends } = entry.person;
    return { names: [name, displayName], sends: sends ?? 0, label: name };
  }
  if (entry.kind === "group") {
    const { name, handle, sends } = entry.group;
    return { names: [name, handle], sends: sends ?? 0, label: name };
  }
  return { names: ["Everyone in the workspace"], sends: 0, label: "Everyone" };
}

/**
 * The people and groups that match what was typed, best first. The picker runs this over what it
 * already has while the directory answers, so results change with every letter.
 */
export function rankEntries(entries: readonly AudienceEntry[], query: string): AudienceEntry[] {
  const { tokens, scope } = parseSearch(query);
  const inScope = entries.filter((entry) => {
    if (entry.kind === "everyone") return false;
    if (scope === "channels") return entry.kind === "group" && entry.group.kind === "channel";
    if (scope === "handles") return entry.kind === "person" || entry.group.kind === "usergroup";
    return true;
  });
  return rankMatches(inScope, tokens, entryRankable);
}

const EVERYONE_WORDS = ["everyone", "all", "workspace", "whole", "company"];

/** Whether what was typed asks for the whole workspace by name, like "every" or "@all". */
export function asksForEveryone(query: string): boolean {
  const { tokens } = parseSearch(query);
  // Two letters at least: "a" alone is the start of too many names.
  return (
    tokens.join("").length > 1 &&
    tokens.every((token) => EVERYONE_WORDS.some((word) => word.startsWith(token)))
  );
}

/**
 * The list under the field. Everyone in the workspace is always offered: first when nothing is
 * typed or it was asked for by name, otherwise after the matches.
 */
export function resultList(matches: readonly AudienceEntry[], query: string): AudienceEntry[] {
  const everyone: AudienceEntry = { kind: "everyone", id: "everyone" };
  if (!query.trim() || asksForEveryone(query)) return [everyone, ...matches];
  return [...matches, everyone];
}

// ─── Pasting a list ──────────────────────────────────────────────────────────────────────────

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const MAX_TERMS = 100;

/** "Ana Torres <ana@acme.com>" is Ana's email; quotes around a name come off. */
function cleanTerm(part: string): string {
  const bracketed = part.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (bracketed?.[1]) return bracketed[1];
  return part.replace(/^["'“‘]+|["'”’]+$/g, "").trim();
}

/**
 * The names, handles and emails in pasted text, or null when it reads as one search. A list is
 * split by lines, commas, semicolons or tabs; handles, channels and emails also split by spaces.
 */
export function parsePastedList(text: string): string[] | null {
  const parts = text
    .split(/[\n\r,;\t]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const terms = parts.flatMap((part) => {
    const words = part.split(/\s+/);
    const tagged = words.every((word) => /^[@#]\S/.test(word) || EMAIL.test(word));
    return words.length > 1 && tagged ? words : [part];
  });
  const cleaned = terms.map(cleanTerm).filter(Boolean);
  const byKey = new Map<string, string>();
  for (const term of cleaned)
    if (!byKey.has(term.toLowerCase())) byKey.set(term.toLowerCase(), term);
  const unique = [...byKey.values()];
  if (unique.length === 0) return null;
  // One name is a search; one email is not, because the search does not read emails.
  if (unique.length === 1 && !EMAIL.test(unique[0] ?? "")) return null;
  return unique.slice(0, MAX_TERMS);
}

const orList = new Intl.ListFormat("en", { type: "disjunction" });
const andList = new Intl.ListFormat("en", { type: "conjunction" });

/** What a paste could not add, in a sentence or two, or null when everything matched. */
export function missedSentence(missed: Resolved["missed"]): string | null {
  const none = missed.filter((m) => m.reason === "none").map((m) => m.term);
  const several = missed.filter((m) => m.reason === "several").map((m) => m.term);
  const sentences: string[] = [];
  if (none.length > 0) sentences.push(`No one in Slack matches ${orList.format(none)}.`);
  if (several.length === 1) {
    sentences.push(`${several[0]} matches more than one person. Type it to choose.`);
  } else if (several.length > 1) {
    sentences.push(
      `${andList.format(several)} each match more than one person. Type them to choose.`,
    );
  }
  return sentences.length ? sentences.join(" ") : null;
}

/** What a paste added, for the announcement. */
export function pastedSentence(added: number): string {
  if (added === 0) return "Nothing from the list was added.";
  if (added === 1) return "Added 1 from the list.";
  return `Added ${added} from the list.`;
}

// ─── Keys ────────────────────────────────────────────────────────────────────────────────────

export interface FieldKey {
  key: string;
  /** What is typed in the field. */
  value: string;
  /** Where the caret is, and whether text is selected. */
  caret: number;
  selection: boolean;
  chips: number;
  open: boolean;
  /** A result is highlighted in the list. */
  highlighted: boolean;
  shift: boolean;
  /** Command on a Mac, Control elsewhere. */
  mod: boolean;
}

/**
 * What a key in the field does beyond the list's own keys (the arrows, Enter, Escape):
 * - `select-last-chip`: Backspace on an empty field, or Left at its start, moves to the last chip.
 *   Backspace there again removes it.
 * - `commit`: Tab or a comma adds the highlighted result.
 * - `swallow`: a comma with nothing to add types nothing.
 * - `undo`: Command or Control Z on an empty field brings back the last chip removed.
 * - `open`: Down or Up on a closed list opens it; `close`: Escape closes it. Escape never clears
 *   the chips, and Enter with the list closed adds nothing hidden.
 */
export type FieldKeyAction =
  | "select-last-chip"
  | "commit"
  | "swallow"
  | "undo"
  | "open"
  | "close"
  | null;

export function fieldKeyAction(k: FieldKey): FieldKeyAction {
  const empty = k.value === "";
  if (k.mod) return k.key.toLowerCase() === "z" && !k.shift && empty ? "undo" : null;
  if (k.key === "Escape") return k.open ? "close" : "swallow";
  if ((k.key === "ArrowDown" || k.key === "ArrowUp") && !k.open) return "open";
  if (k.key === "Enter" && !k.open) return "swallow";
  if (k.key === "Backspace" && empty && k.chips > 0) return "select-last-chip";
  if (k.key === "ArrowLeft" && k.caret === 0 && !k.selection && !k.shift && k.chips > 0) {
    return "select-last-chip";
  }
  if (k.key === "Tab" && !k.shift && k.open && k.highlighted && !empty) return "commit";
  if (k.key === ",") return k.open && k.highlighted && !empty ? "commit" : "swallow";
  return null;
}

/** Where focus goes from a chip, and whether the chip goes. */
export type ChipKeyAction = { focus: number | "input"; remove?: true | undefined } | null;

/**
 * Keys on a chosen chip. Backspace or Delete removes it and goes back to typing. Left and Right
 * walk the chips, and Right off the last one, End or Escape return to the field. A letter goes
 * back to the field too, where it is typed.
 */
export function chipKeyAction(key: string, index: number, count: number): ChipKeyAction {
  if (key === "Backspace" || key === "Delete") return { focus: "input", remove: true };
  if (key === "ArrowLeft") return { focus: Math.max(0, index - 1) };
  if (key === "ArrowRight") return { focus: index + 1 < count ? index + 1 : "input" };
  if (key === "Home") return { focus: 0 };
  if (key === "End" || key === "Escape") return { focus: "input" };
  if (key.length === 1 && key !== " ") return { focus: "input" };
  return null;
}
