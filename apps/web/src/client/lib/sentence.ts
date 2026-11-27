export function closingStop(text: string): string {
  return /[.?!…]["'”’)]*$/.test(text.trim()) ? "" : ".";
}
