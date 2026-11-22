import {
  anonymousThreshold,
  type HollerDraftInput,
  type Mode,
  modes,
  questionLimits,
} from "@holler/core";
import { eq } from "@holler/core/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { csvCell, csvFor, type ExportData, exportCsv, exportMarkdown, mdInline } from "./exports";
import { makeLive, workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";
import { recordResponse } from "./responses";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

const people = ["UA", "UB", "UC", "UD", "UE", "UF"];

function everyType(write: (s: string) => string, anonymous = false): HollerDraftInput {
  return {
    mode: "survey",
    title: write("Offsite"),
    anonymous,
    questions: [
      {
        type: "single",
        prompt: write("Where?"),
        options: [{ label: write("Lisbon") }, { label: write("Tallinn") }],
        allowOther: true,
        followUp: { prompt: write("Why?"), onlyAfter: null },
      },
      {
        type: "multi",
        prompt: write("Which days?"),
        options: [{ label: write("Mon") }, { label: write("Tue") }, { label: write("Wed") }],
      },
      {
        type: "single",
        style: "scale",
        prompt: write("How calm?"),
        options: ["1", "2", "3"].map((label) => ({ label, score: Number(label) })),
      },
      { type: "number", prompt: write("Nights?"), numberMin: -5, numberMax: 7 },
      { type: "person", prompt: write("Who plans it?") },
      { type: "text", prompt: write("Anything else?"), required: false },
    ],
  };
}

async function answered(input: HollerDraftInput, write: (s: string) => string = (s) => s) {
  const fixture = await workspaceFixture(db);
  for (const id of people) {
    await db
      .update(schema.slackPeople)
      .set({ name: write(`Person ${id}`) })
      .where(eq(schema.slackPeople.slackUserId, id));
  }
  const holler = await createDraft(fixture.ctx, input);
  await makeLive(db, holler.id, people, fixture.now);
  const [where, days, calm, nights, who, words] = holler.questions;
  if (!where || !days || !calm || !nights || !who || !words) throw new Error("questions missing");
  const other = where.options.find((o) => o.isOther);
  for (const [i, slackUserId] of people.slice(0, 5).entries()) {
    await recordResponse(fixture.ctx, {
      hollerId: holler.id,
      slackUserId,
      via: "web",
      response: {
        answers: [
          i === 4
            ? { questionId: where.id, optionIds: [other?.id ?? ""], otherText: write("Riga") }
            : {
                questionId: where.id,
                optionIds: [where.options[i % 2]?.id ?? ""],
                note: write("Sunny"),
              },
          {
            questionId: days.id,
            optionIds: [days.options[0]?.id ?? "", days.options[2]?.id ?? ""],
          },
          { questionId: calm.id, optionIds: [calm.options[i % 3]?.id ?? ""] },
          { questionId: nights.id, number: i - 2 },
          { questionId: who.id, slackUserIds: ["UF"] },
          { questionId: words.id, text: write(`Bring coats, "please" ${i}`) },
        ],
      },
    });
  }
  return { ...fixture, holler };
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = csv.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += c;
  }
  return rows;
}

describe("exportCsv", () => {
  it("has one row per response, with who answered on a named Holler", async () => {
    const { ctx, holler } = await answered(everyType((s) => s));
    const rows = parseCsv(await exportCsv(ctx, holler.id));
    expect(rows[0]).toEqual([
      "Submitted at",
      "Person",
      "Slack user id",
      "Where?",
      "Where? (Other)",
      "Where? (note)",
      "Which days?",
      "How calm?",
      "Nights?",
      "Who plans it?",
      "Anything else?",
    ]);
    expect(rows).toHaveLength(6);
    expect(rows[1]?.slice(1)).toEqual([
      "Person UA",
      "UA",
      "Lisbon",
      "",
      "Sunny",
      "Mon; Wed",
      "1",
      "-2",
      "Person UF",
      'Bring coats, "please" 0',
    ]);
    expect(rows[5]?.slice(3, 6)).toEqual(["Other", "Riga", ""]);
  });

  it("names nobody and keeps no answer order on an anonymous Holler", async () => {
    const { ctx, holler } = await answered(everyType((s) => s, true));
    const csv = await exportCsv(ctx, holler.id);
    const rows = parseCsv(csv);
    expect(rows[0]?.slice(0, 2)).toEqual(["Answered", "Where?"]);
    expect(csv).not.toMatch(/UA|Person UA|Submitted at/);
    expect(rows.slice(1).map((row) => row[0])).toEqual(Array(5).fill("Yes"));
    const body = rows.slice(1).map((r) => r.join(","));
    expect(body).toEqual([...body].sort());
  });

  it("refuses an anonymous Holler under the threshold, as results do", async () => {
    const fixture = await workspaceFixture(db);
    const holler = await createDraft(
      fixture.ctx,
      everyType((s) => s, true),
    );
    await makeLive(db, holler.id, people, fixture.now);
    await expect(exportCsv(fixture.ctx, holler.id)).rejects.toMatchObject({
      code: "forbidden",
      message: expect.stringContaining(`${anonymousThreshold} more answers`),
    });
    await expect(exportMarkdown(fixture.ctx, holler.id)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("defuses every formula someone could type, in every cell a person wrote", async () => {
    for (const start of ["=", "+", "-", "@", "\t", "\r", "＝", "＋", "－", "＠"]) {
      const write = (s: string) => `${start}HYPERLINK("https://evil.test","${s}")`;
      const { ctx, holler } = await answered(everyType(write), write);
      const rows = parseCsv(await exportCsv(ctx, holler.id));
      for (const [r, row] of rows.entries()) {
        for (const [c, cell] of row.entries()) {
          if (/^-?\d+$/.test(cell)) continue;
          expect(cell, `row ${r}, column ${c}, start ${JSON.stringify(start)}`).not.toMatch(
            /^[=+\-@\t\r＝＋－＠]/,
          );
        }
      }
    }
  });

  it("refuses a Holler the member may not see", async () => {
    const { holler } = await answered(everyType((s) => s));
    const stranger = await workspaceFixture(db);
    await expect(exportCsv(stranger.ctx, holler.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("exportMarkdown", () => {
  it("sums up every question and names nobody", async () => {
    const { ctx, holler } = await answered(everyType((s) => s));
    const md = await exportMarkdown(ctx, holler.id);
    expect(md).toContain("# Offsite\n\n5 of 6 people answered.");
    expect(md).toContain("| Lisbon | 2 | 40% |");
    expect(md).toContain("Other:\n\n- Riga");
    expect(md).toContain("Notes:\n\n- Sunny");
    expect(md).toContain("Average: 1.8");
    expect(md).toContain("| 0 | 0 | -2 | 2 |");
    expect(md).toContain("| Person UF | 5 | 100% |");
    expect(md).not.toMatch(/Person U[A-E]|\bU[A-E]\b/);
  });

  it("keeps every table whole and every answer on its own line, whatever people typed", async () => {
    const write = (s: string) => `| # ${s} |\n\n- [x](javascript:alert(1)) <b>*_\`${s}`;
    const { ctx, holler } = await answered(everyType(write), write);
    const md = await exportMarkdown(ctx, holler.id);
    const lines = md.split("\n");
    for (const line of lines.filter((l) => l.startsWith("|"))) {
      const pipes = line.replace(/\\\|/g, "").match(/\|/g)?.length ?? 0;
      expect([4, 5], line).toContain(pipes);
    }
    for (const line of lines) {
      expect(line, line).toMatch(
        /^(# |## |- |\| |[0-9]+ (of|people|person)|1 person|Average|Other:|Notes:|$)/,
      );
    }
    expect(md).not.toMatch(/<b>|\]\(javascript/);
  });
});

async function sentIn(mode: Mode, anonymous: boolean, answeredBy: readonly string[]) {
  const fixture = await workspaceFixture(db);
  const holler = await createDraft(fixture.ctx, {
    mode,
    title: "Offsite",
    anonymous,
    questions: Array.from({ length: questionLimits[mode].max }, (_, at) => ({
      type: "text" as const,
      prompt: `Question ${at}`,
      required: false,
    })),
  });
  await makeLive(db, holler.id, people, fixture.now);
  for (const [at, slackUserId] of answeredBy.entries()) {
    const skipsEveryQuestion = at === 0;
    await recordResponse(fixture.ctx, {
      hollerId: holler.id,
      slackUserId,
      via: "web",
      response: {
        answers: skipsEveryQuestion
          ? []
          : holler.questions.map((question) => ({ questionId: question.id, text: `Coat ${at}` })),
      },
    });
  }
  return { ...fixture, holler };
}

const everyExport = modes.flatMap((mode) =>
  [false, true].map((anonymous) => ({ mode, anonymous, who: anonymous ? "anonymous" : "named" })),
);

describe.each(everyExport)("every export of $who $mode hollers", ({ mode, anonymous }) => {
  it("has a header and one row with something in it for each response", async () => {
    const answeredBy = people.slice(0, anonymousThreshold);
    const { ctx, holler } = await sentIn(mode, anonymous, answeredBy);
    const [header, ...rows] = parseCsv(await exportCsv(ctx, holler.id));
    expect(header?.filter((cell) => cell === "")).toEqual([]);
    expect(rows).toHaveLength(answeredBy.length);
    for (const row of rows) {
      expect(row).toHaveLength(header?.length ?? 0);
      expect(row.join("")).not.toBe("");
    }
    expect(await exportMarkdown(ctx, holler.id)).toContain(
      `${answeredBy.length} of ${people.length} people answered.`,
    );
  });

  it.runIf(anonymous)("opens at the threshold and says neither who nor when", async () => {
    const early = await sentIn(mode, anonymous, people.slice(0, anonymousThreshold - 1));
    await expect(exportCsv(early.ctx, early.holler.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    const { ctx, holler } = await sentIn(mode, anonymous, people.slice(0, anonymousThreshold));
    const csv = await exportCsv(ctx, holler.id);
    expect(csv).not.toMatch(/\bU[A-F]\b|Person|20\d\d-/);
    const rows = csv.split("\r\n").slice(1, -1);
    expect(rows).toEqual([...rows].sort());
  });
});

function readsOf<T extends object>(rows: T[], count: () => void): T[] {
  return new Proxy(rows, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) count();
      return Reflect.get(target, key, receiver);
    },
  });
}

function rowsReadToBuild(size: { responses: number; questions: number }): number {
  let reads = 0;
  const count = () => {
    reads += 1;
  };
  const questions: ExportData["questions"] = Array.from({ length: size.questions }, (_, at) => ({
    id: `question_${at}`,
    prompt: `Question ${at}`,
    type: "single",
    options: [{ id: `option_${at}`, label: "Other", isOther: true }],
  }));
  const responses = Array.from({ length: size.responses }, (_, at) => ({
    id: `response_${at}`,
    submittedAt: new Date(0),
    slackUserId: `U${at}`,
  }));
  const each = responses.flatMap((response) =>
    questions.map((question) => ({ responseId: response.id, questionId: question.id })),
  );
  csvFor({
    title: "Offsite",
    anonymous: false,
    recipientCount: size.responses,
    answeredCount: size.responses,
    questions,
    responses: readsOf(responses, count),
    answers: readsOf(
      each.map((at) => ({
        ...at,
        optionId: at.questionId.replace("question", "option"),
        text: null,
      })),
      count,
    ),
    notes: readsOf(
      each.flatMap((at) => [
        { ...at, kind: "other" as const, text: "Riga" },
        { ...at, kind: "note" as const, text: "Sunny" },
      ]),
      count,
    ),
    names: new Map(),
    results: { state: "open", responseCount: size.responses, questions: [] },
  });
  return reads;
}

describe("csvFor", () => {
  it("reads no more rows for each response or question as a Holler grows", () => {
    const once = rowsReadToBuild({ responses: 40, questions: 6 });
    expect(rowsReadToBuild({ responses: 80, questions: 6 }) / once).toBeLessThanOrEqual(2);
    expect(rowsReadToBuild({ responses: 40, questions: 12 }) / once).toBeLessThanOrEqual(2);
  });
});

describe("csvCell and mdInline", () => {
  it("quotes what needs quoting and leaves a checked number a number", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("-3", "number")).toBe("-3");
    expect(csvCell("-3")).toBe("'-3");
    expect(csvCell("=1+1", "number")).toBe("'=1+1");
  });

  it("escapes Markdown that would start a block", () => {
    expect(mdInline("1. one")).toBe("1\\. one");
    expect(mdInline("- dash")).toBe("\\- dash");
    expect(mdInline("a\nb")).toBe("a b");
  });
});
