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

export function newReportToken(): string {
  return randomToken(32);
}

export function isId(kind: IdKind, value: string): boolean {
  return new RegExp(`^${idPrefixes[kind]}_[${ALPHABET}]{16}$`).test(value);
}
