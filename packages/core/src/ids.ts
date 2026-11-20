/**
 * Ids are a type prefix and 16 random base32 characters: `hol_k3v9q2m8x1c4b7nd`. The prefix
 * says what an id points at in a log line or an API payload; the rest is 80 bits of randomness.
 */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export const idPrefixes = {
  workspace: "wsp",
  member: "mem",
  holler: "hol",
  question: "que",
  option: "opt",
  response: "res",
  answer: "ans",
  activity: "act",
} as const;

export type IdKind = keyof typeof idPrefixes;

export function randomToken(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte & 31];
  return out;
}

export function newId(kind: IdKind): string {
  return `${idPrefixes[kind]}_${randomToken(16)}`;
}

/** A report link's secret: 32 characters, 160 bits. */
export function newReportToken(): string {
  return randomToken(32);
}

export function isId(kind: IdKind, value: string): boolean {
  return new RegExp(`^${idPrefixes[kind]}_[${ALPHABET}]{16}$`).test(value);
}
