import { describe, expect, it } from "vitest";
import {
  asksForEveryone,
  chipKeyAction,
  type FieldKey,
  fieldKeyAction,
  missedSentence,
  parsePastedList,
  rankEntries,
  resultList,
} from "./audience-logic";
import { type AudienceEntry, entryName, groupEntry, personEntry } from "./directory";

const person = (id: string, name: string, displayName: string | null = null, sends = 0) =>
  personEntry({ slackUserId: id, name, displayName, avatarUrl: null, timeZone: null, sends });
const group = (id: string, kind: "usergroup" | "channel", name: string, handle: string | null) =>
  groupEntry({ slackId: id, kind, name, handle, memberCount: 4 });

const entries: AudienceEntry[] = [
  person("U1", "Anastasia Moreau"),
  person("U2", "Dana Alon"),
  person("U3", "Ana Torres", "ana", 2),
  person("U4", "Tomás Ruiz"),
  group("S1", "usergroup", "Design team", "design-team"),
  group("C1", "channel", "product", null),
  group("S2", "usergroup", "Product leads", "product-leads"),
];
const names = (list: AudienceEntry[]) => list.map(entryName);

describe("rankEntries", () => {
  it("ranks a name's start above a match inside it", () => {
    expect(names(rankEntries(entries, "ana"))).toEqual([
      "Ana Torres",
      "Anastasia Moreau",
      "Dana Alon",
    ]);
  });

  it("ignores accents and reads @ as handles and # as channels", () => {
    expect(names(rankEntries(entries, "tomas"))).toEqual(["Tomás Ruiz"]);
    expect(names(rankEntries(entries, "@design-team"))).toEqual(["@design-team"]);
    expect(names(rankEntries(entries, "#prod"))).toEqual(["#product"]);
    expect(names(rankEntries(entries, "@prod"))).toEqual(["@product-leads"]);
  });
});

describe("resultList", () => {
  const found = rankEntries(entries, "ana");
  it("always offers Everyone, last after matches", () => {
    expect(names(resultList(found, "ana")).at(-1)).toBe("Everyone in the workspace");
    expect(names(resultList([], "zed"))).toEqual(["Everyone in the workspace"]);
  });

  it("puts Everyone first when nothing is typed or it is asked for", () => {
    expect(names(resultList(found, ""))[0]).toBe("Everyone in the workspace");
    expect(names(resultList([], "every"))[0]).toBe("Everyone in the workspace");
    expect(asksForEveryone("@all")).toBe(true);
    expect(asksForEveryone("ana")).toBe(false);
    expect(asksForEveryone("a")).toBe(false);
  });
});

describe("parsePastedList", () => {
  it("splits lines, commas, semicolons and tabs", () => {
    expect(parsePastedList("Ana Torres, Dana Alon\nTomás Ruiz;\tKai")).toEqual([
      "Ana Torres",
      "Dana Alon",
      "Tomás Ruiz",
      "Kai",
    ]);
  });

  it("splits handles, channels and emails by spaces too", () => {
    expect(parsePastedList("@mira @design-team #product ana@acme.com")).toEqual([
      "@mira",
      "@design-team",
      "#product",
      "ana@acme.com",
    ]);
  });

  it("takes the email out of a mail client's address", () => {
    expect(parsePastedList('"Ana Torres" <ana@acme.com>, Dana <dana@acme.com>')).toEqual([
      "ana@acme.com",
      "dana@acme.com",
    ]);
  });

  it("reads one name as a search, but one email as a list", () => {
    expect(parsePastedList("Ana Torres")).toBeNull();
    expect(parsePastedList("  ")).toBeNull();
    expect(parsePastedList("ana@acme.com")).toEqual(["ana@acme.com"]);
  });

  it("drops repeats and keeps at most 100", () => {
    expect(parsePastedList("Ana, ana, ANA, Dana")).toEqual(["Ana", "Dana"]);
    const many = Array.from({ length: 150 }, (_, i) => `p${i}@acme.com`).join("\n");
    expect(parsePastedList(many)).toHaveLength(100);
  });
});

describe("missedSentence", () => {
  it("says which terms matched nobody and which matched several", () => {
    expect(missedSentence([])).toBeNull();
    expect(missedSentence([{ term: "zed", reason: "none" }])).toBe("No one in Slack matches zed.");
    expect(
      missedSentence([
        { term: "zed", reason: "none" },
        { term: "kim@acme.com", reason: "none" },
        { term: "Ana", reason: "several" },
      ]),
    ).toBe(
      "No one in Slack matches zed or kim@acme.com. Ana matches more than one person. Type it to choose.",
    );
    expect(
      missedSentence([
        { term: "Ana", reason: "several" },
        { term: "Kai", reason: "several" },
      ]),
    ).toBe("Ana and Kai each match more than one person. Type them to choose.");
  });
});

describe("fieldKeyAction", () => {
  const key = (over: Partial<FieldKey>): FieldKey => ({
    key: "a",
    value: "",
    caret: 0,
    selection: false,
    chips: 2,
    open: false,
    highlighted: false,
    shift: false,
    mod: false,
    ...over,
  });

  it("moves to the last chip on Backspace in an empty field, or Left at its start", () => {
    expect(fieldKeyAction(key({ key: "Backspace" }))).toBe("select-last-chip");
    expect(fieldKeyAction(key({ key: "Backspace", value: "a", caret: 1 }))).toBeNull();
    expect(fieldKeyAction(key({ key: "Backspace", chips: 0 }))).toBeNull();
    expect(fieldKeyAction(key({ key: "ArrowLeft", value: "ana", caret: 0 }))).toBe(
      "select-last-chip",
    );
    expect(fieldKeyAction(key({ key: "ArrowLeft", value: "ana", caret: 2 }))).toBeNull();
    expect(
      fieldKeyAction(key({ key: "ArrowLeft", value: "ana", caret: 0, selection: true })),
    ).toBeNull();
  });

  it("adds the highlighted result on Tab or a comma", () => {
    const typing = { value: "ana", caret: 3, open: true, highlighted: true };
    expect(fieldKeyAction(key({ key: "Tab", ...typing }))).toBe("commit");
    expect(fieldKeyAction(key({ key: ",", ...typing }))).toBe("commit");
    expect(fieldKeyAction(key({ key: "Tab", ...typing, shift: true }))).toBeNull();
    expect(
      fieldKeyAction(key({ key: "Tab", value: "", open: true, highlighted: true })),
    ).toBeNull();
    expect(fieldKeyAction(key({ key: ",", value: "ana", caret: 3 }))).toBe("swallow");
  });

  it("opens on Down or Up, closes on Escape, and never lets Escape clear the chips", () => {
    expect(fieldKeyAction(key({ key: "ArrowDown" }))).toBe("open");
    expect(fieldKeyAction(key({ key: "ArrowUp" }))).toBe("open");
    expect(fieldKeyAction(key({ key: "ArrowDown", open: true }))).toBeNull();
    expect(fieldKeyAction(key({ key: "Escape", open: true }))).toBe("close");
    expect(fieldKeyAction(key({ key: "Escape" }))).toBe("swallow");
    expect(fieldKeyAction(key({ key: "Enter", value: "ana" }))).toBe("swallow");
    expect(fieldKeyAction(key({ key: "Enter", value: "ana", open: true }))).toBeNull();
  });

  it("undoes the last removal on Command or Control Z in an empty field", () => {
    expect(fieldKeyAction(key({ key: "z", mod: true }))).toBe("undo");
    expect(fieldKeyAction(key({ key: "z", mod: true, value: "a" }))).toBeNull();
    expect(fieldKeyAction(key({ key: "z", mod: true, shift: true }))).toBeNull();
    expect(fieldKeyAction(key({ key: "Backspace", mod: true }))).toBeNull();
  });
});

describe("chipKeyAction", () => {
  it("removes on the second Backspace and goes back to typing", () => {
    expect(chipKeyAction("Backspace", 2, 3)).toEqual({ focus: "input", remove: true });
    expect(chipKeyAction("Delete", 0, 3)).toEqual({ focus: "input", remove: true });
  });

  it("walks the chips and leaves them for the field", () => {
    expect(chipKeyAction("ArrowLeft", 2, 3)).toEqual({ focus: 1 });
    expect(chipKeyAction("ArrowLeft", 0, 3)).toEqual({ focus: 0 });
    expect(chipKeyAction("ArrowRight", 1, 3)).toEqual({ focus: 2 });
    expect(chipKeyAction("ArrowRight", 2, 3)).toEqual({ focus: "input" });
    expect(chipKeyAction("Home", 2, 3)).toEqual({ focus: 0 });
    expect(chipKeyAction("Escape", 1, 3)).toEqual({ focus: "input" });
    expect(chipKeyAction("m", 1, 3)).toEqual({ focus: "input" });
    expect(chipKeyAction("Enter", 1, 3)).toBeNull();
    expect(chipKeyAction(" ", 1, 3)).toBeNull();
  });
});
