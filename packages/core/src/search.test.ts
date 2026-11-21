import { describe, expect, it } from "vitest";
import { foldForSearch, foldText, matchTier, parseSearch, rankMatches } from "./search";

describe("foldText", () => {
  it("ignores case and accents", () => {
    expect(foldText("Tomás Ruiz")).toBe("tomas ruiz");
    expect(foldText("ZOË")).toBe("zoe");
    expect(foldText("Łukasz Søren Straße")).toBe("lukasz soren strasse");
    expect(foldText("İlker")).toBe("ilker");
  });

  it("reads hyphens, dots and underscores as spaces and drops apostrophes", () => {
    expect(foldText("design-team")).toBe("design team");
    expect(foldText("mira.kask_dev")).toBe("mira kask dev");
    expect(foldText("Siobhán O’Brien")).toBe("siobhan obrien");
  });

  it("keeps every script, folding the case of those that have one", () => {
    expect(foldText("Ілля Волков")).toBe("ілля волков");
    expect(foldText("Ελένη")).toBe("ελενη");
    expect(foldText("渡辺 純")).toBe("渡辺 純");
    expect(foldText("김민지")).toBe("김민지");
    expect(foldText("がっこう")).toBe("がっこう");
    expect(foldText("प्रिया")).toBe("प्रिया");
  });

  it("folds full-width letters to plain ones", () => {
    expect(foldText("ＭＩＲＡ")).toBe("mira");
  });

  it("joins every name for the stored column", () => {
    expect(foldForSearch("Mira Kask", "mira", null)).toBe("mira kask mira");
  });
});

describe("parseSearch", () => {
  it("splits words and reads @ and # as what to search", () => {
    expect(parseSearch("  Mira  Kask ")).toEqual({ tokens: ["mira", "kask"], scope: "all" });
    expect(parseSearch("@design-team")).toEqual({ tokens: ["design", "team"], scope: "handles" });
    expect(parseSearch("#product")).toEqual({ tokens: ["product"], scope: "channels" });
    expect(parseSearch("")).toEqual({ tokens: [], scope: "all" });
  });

  it("keeps at most five words, once each", () => {
    expect(parseSearch("a b c d e f a").tokens).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("matchTier", () => {
  const mira = ["Mira Kask", "mira"];
  it("ranks the whole name, its first words, its start, a later word's start, then inside", () => {
    expect(matchTier(mira, ["mira"])).toBe(0);
    expect(matchTier(["Mira Kask"], ["mira"])).toBe(1);
    expect(matchTier(mira, ["mira", "ka"])).toBe(2);
    expect(matchTier(mira, ["mi"])).toBe(2);
    expect(matchTier(mira, ["kask"])).toBe(3);
    expect(matchTier(mira, ["kask", "mira"])).toBe(3);
    expect(matchTier(mira, ["ask"])).toBe(4);
    expect(matchTier(mira, ["zed"])).toBeNull();
    expect(matchTier(mira, ["mira", "zed"])).toBeNull();
  });

  it("matches without accents either way", () => {
    expect(matchTier(["Tomás Ruiz"], ["tomas"])).toBe(1);
    expect(matchTier(["Tomas Ruiz"], parseSearch("Tomás").tokens)).toBe(1);
    expect(matchTier(["Tomás Ruiz"], ["tom"])).toBe(2);
  });
});

describe("rankMatches", () => {
  const people = [
    { name: "Anastasia Moreau", sends: 0 },
    { name: "Dana Alon", sends: 0 },
    { name: "Ana Torres", sends: 0 },
    { name: "Joana Berg", sends: 5 },
    { name: "Ana Lima", sends: 3 },
  ];
  const rank = (query: string) =>
    rankMatches(people, parseSearch(query).tokens, (p) => ({
      names: [p.name],
      sends: p.sends,
      label: p.name,
    })).map((p) => p.name);

  it("puts names that start with it above names it is inside", () => {
    expect(rank("ana")).toEqual([
      "Ana Lima",
      "Ana Torres",
      "Anastasia Moreau",
      "Joana Berg",
      "Dana Alon",
    ]);
  });

  it("puts people the sender sends to often first among equal matches", () => {
    expect(rank("an")).toEqual([
      "Ana Lima",
      "Ana Torres",
      "Anastasia Moreau",
      "Joana Berg",
      "Dana Alon",
    ]);
    expect(rank("")).toEqual([
      "Joana Berg",
      "Ana Lima",
      "Ana Torres",
      "Anastasia Moreau",
      "Dana Alon",
    ]);
  });

  it("leaves out what does not match", () => {
    expect(rank("berg")).toEqual(["Joana Berg"]);
    expect(rank("zed")).toEqual([]);
  });
});
