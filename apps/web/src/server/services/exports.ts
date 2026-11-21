import { anonymousThreshold, type Results, summarize } from "@holler/core";
import { and, asc, eq, inArray } from "@holler/core/db";
import { schema } from "../db";
import { type ServiceContext, ServiceError } from "./context";
import { getHoller } from "./hollers";

const { questions, options, responses, answers, answerNotes, recipients, slackPeople } = schema;

/**
 * A Holler's results as a file, for every door: the web app, the API and MCP. CSV is every
 * response, one row each, for spreadsheets. Markdown is the results summary, for docs; it names
 * nobody, so it can be pasted anywhere. Both keep the anonymity gate: under five answers an
 * anonymous Holler exports nothing, and its CSV never says who answered or in which order.
 */

/** Everything an export reads, loaded once. Exported for the pure builders' tests. */
export interface ExportData {
  title: string;
  anonymous: boolean;
  recipientCount: number;
  answeredCount: number;
  questions: {
    id: string;
    prompt: string;
    type: "single" | "multi" | "text" | "number" | "person";
    options: { id: string; label: string; isOther: boolean }[];
  }[];
  responses: {
    id: string;
    submittedAt: Date;
    /** Null on an anonymous Holler. */
    slackUserId: string | null;
  }[];
  answers: {
    responseId: string;
    questionId: string;
    optionId: string | null;
    text: string | null;
  }[];
  notes: { responseId: string; questionId: string; kind: "note" | "other"; text: string }[];
  /** Names Holler shows for people, by Slack user id: who answered, and who a person question picked. */
  names: ReadonlyMap<string, string>;
  results: Results;
}

export async function exportCsv(ctx: ServiceContext, id: string): Promise<string> {
  return csvFor(await exportData(ctx, id));
}

export async function exportMarkdown(ctx: ServiceContext, id: string): Promise<string> {
  return markdownFor(await exportData(ctx, id));
}

async function exportData(ctx: ServiceContext, hollerId: string): Promise<ExportData> {
  // getHoller throws not_found unless the member may see it.
  const holler = await getHoller(ctx, hollerId);
  const responseRows = await ctx.db
    .select({
      id: responses.id,
      submittedAt: responses.submittedAt,
      slackUserId: responses.slackUserId,
    })
    .from(responses)
    .where(eq(responses.hollerId, hollerId))
    .orderBy(asc(responses.submittedAt));
  if (holler.anonymous && responseRows.length < anonymousThreshold) {
    const needed = anonymousThreshold - responseRows.length;
    throw new ServiceError(
      "forbidden",
      needed === 1
        ? `This Holler is anonymous, so its results open at ${anonymousThreshold} answers. One more answer opens them.`
        : `This Holler is anonymous, so its results open at ${anonymousThreshold} answers. ${needed} more answers open them.`,
    );
  }
  const qs = await ctx.db
    .select()
    .from(questions)
    .where(eq(questions.hollerId, hollerId))
    .orderBy(questions.position);
  const opts =
    qs.length === 0
      ? []
      : await ctx.db
          .select()
          .from(options)
          .where(
            inArray(
              options.questionId,
              qs.map((q) => q.id),
            ),
          )
          .orderBy(options.position);
  const answerRows = await ctx.db
    .select({
      responseId: answers.responseId,
      questionId: answers.questionId,
      optionId: answers.optionId,
      text: answers.text,
      slackUserId: responses.slackUserId,
    })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .where(eq(responses.hollerId, hollerId));
  const noteRows = await ctx.db
    .select({
      responseId: answerNotes.responseId,
      questionId: answerNotes.questionId,
      kind: answerNotes.kind,
      text: answerNotes.text,
      slackUserId: responses.slackUserId,
    })
    .from(answerNotes)
    .innerJoin(responses, eq(responses.id, answerNotes.responseId))
    .where(eq(responses.hollerId, hollerId));
  const recipientRows = await ctx.db
    .select({ answeredAt: recipients.answeredAt })
    .from(recipients)
    .where(eq(recipients.hollerId, hollerId));

  const personQuestions = new Set(qs.filter((q) => q.type === "person").map((q) => q.id));
  const names = await namesOf(ctx, [
    ...responseRows.flatMap((r) => (r.slackUserId ? [r.slackUserId] : [])),
    ...answerRows.flatMap((a) => (personQuestions.has(a.questionId) && a.text ? [a.text] : [])),
  ]);
  const questionList = qs.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    type: q.type,
    style: q.style,
    options: opts
      .filter((o) => o.questionId === q.id)
      .map((o) => ({ id: o.id, label: o.label, score: o.score, isOther: o.isOther })),
  }));
  return {
    title: holler.displayTitle,
    anonymous: holler.anonymous,
    recipientCount: recipientRows.length,
    answeredCount: recipientRows.filter((r) => r.answeredAt != null).length,
    questions: questionList,
    responses: responseRows,
    answers: answerRows,
    notes: noteRows,
    names,
    results: summarize({
      anonymous: holler.anonymous,
      responseCount: responseRows.length,
      questions: questionList,
      answers: answerRows,
      notes: noteRows,
      names,
    }),
  };
}

async function namesOf(
  ctx: ServiceContext,
  slackUserIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(slackUserIds)];
  const names = new Map<string, string>();
  // D1 binds at most 100 values in one statement; the workspace id takes one.
  for (let at = 0; at < ids.length; at += 90) {
    const rows = await ctx.db
      .select({
        slackUserId: slackPeople.slackUserId,
        name: slackPeople.name,
        displayName: slackPeople.displayName,
      })
      .from(slackPeople)
      .where(
        and(
          eq(slackPeople.workspaceId, ctx.workspaceId),
          inArray(slackPeople.slackUserId, ids.slice(at, at + 90)),
        ),
      );
    for (const row of rows) names.set(row.slackUserId, row.displayName || row.name);
  }
  return names;
}

// CSV

/**
 * A cell that starts with one of these is read as a formula by Excel, Google Sheets and
 * LibreOffice, so text someone typed could run in the sender's spreadsheet. OWASP's advice: put
 * a single quote in front, which every one of them shows as plain text.
 */
const formulaStart = /^[=+\-@\t\r＝＋－＠]/;

/** Exported for tests. Quotes a cell when it needs it and defuses a formula. */
export function csvCell(value: string, kind: "text" | "number" = "text"): string {
  // A number cell holds a whole number Holler checked when it was answered, such as -3; leave it a number.
  const safe = kind === "number" && /^-?\d+$/.test(value) ? value : defuse(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function defuse(value: string): string {
  return formulaStart.test(value) ? `'${value}` : value;
}

/**
 * Exported for tests. One row per response. A named Holler leads with who answered and when; an
 * anonymous one has neither the person nor the time, and its rows are sorted by what they say,
 * so their order cannot be matched to when anyone answered.
 */
export function csvFor(data: ExportData): string {
  const header: string[] = data.anonymous ? [] : ["Submitted at", "Person", "Slack user id"];
  const columns: { questionId: string; kind: "answer" | "other" | "note" }[] = [];
  for (const q of data.questions) {
    header.push(q.prompt);
    columns.push({ questionId: q.id, kind: "answer" });
    if (q.type === "single" || q.type === "multi") {
      if (q.options.some((o) => o.isOther)) {
        header.push(`${q.prompt} (Other)`);
        columns.push({ questionId: q.id, kind: "other" });
      }
      if (data.notes.some((n) => n.questionId === q.id && n.kind === "note")) {
        header.push(`${q.prompt} (note)`);
        columns.push({ questionId: q.id, kind: "note" });
      }
    }
  }
  const questionById = new Map(data.questions.map((q) => [q.id, q]));
  const rows = data.responses.map((response) => {
    const cells: string[] = data.anonymous
      ? []
      : [
          csvCell(response.submittedAt.toISOString()),
          csvCell(response.slackUserId ? (data.names.get(response.slackUserId) ?? "") : ""),
          csvCell(response.slackUserId ?? ""),
        ];
    for (const column of columns) {
      const question = questionById.get(column.questionId);
      if (!question) continue;
      if (column.kind !== "answer") {
        const note = data.notes.find(
          (n) =>
            n.responseId === response.id &&
            n.questionId === column.questionId &&
            n.kind === column.kind,
        );
        cells.push(csvCell(note?.text ?? ""));
        continue;
      }
      const own = data.answers.filter(
        (a) => a.responseId === response.id && a.questionId === column.questionId,
      );
      if (question.type === "number") {
        cells.push(csvCell(own[0]?.text ?? "", "number"));
      } else if (question.type === "text") {
        cells.push(csvCell(own[0]?.text ?? ""));
      } else if (question.type === "person") {
        cells.push(
          csvCell(own.map((a) => (a.text ? (data.names.get(a.text) ?? a.text) : "")).join("; ")),
        );
      } else {
        const labels = question.options
          .filter((o) => own.some((a) => a.optionId === o.id))
          .map((o) => o.label);
        cells.push(csvCell(labels.join("; ")));
      }
    }
    return cells.join(",");
  });
  if (data.anonymous) rows.sort();
  // A byte order mark, so Excel opens the file as UTF-8 and names like Дієслова survive.
  return `﻿${[header.map((h) => csvCell(h)).join(","), ...rows].join("\r\n")}\r\n`;
}

// Markdown

/** Exported for tests. Inline Markdown that cannot start a block or break a table. */
export function mdInline(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\`*_[\]{}()<>#+!|~]/g, (c) => `\\${c}`)
    .replace(/^(\d+)\./, "$1\\.")
    .replace(/^-/, "\\-");
}

const whole = new Intl.NumberFormat("en");
const share = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 0 });

/**
 * Exported for tests. The results as a doc: the answered count, then per question a table of
 * options or the numbers, and the written answers as a list. It names no one, on any Holler.
 */
export function markdownFor(data: ExportData): string {
  const lines: string[] = [`# ${mdInline(data.title) || "Untitled"}`, ""];
  lines.push(
    data.recipientCount === 1
      ? `${whole.format(data.answeredCount)} of 1 person answered.`
      : `${whole.format(data.answeredCount)} of ${whole.format(data.recipientCount)} people answered.`,
  );
  if (data.anonymous) lines.push("", "Anonymous: answers are not linked to anyone.");
  if (data.results.state !== "open") return `${lines.join("\n")}\n`;
  for (const q of data.results.questions) {
    lines.push("", `## ${mdInline(q.prompt)}`, "");
    lines.push(
      q.answeredCount === 1
        ? "1 person answered."
        : `${whole.format(q.answeredCount)} people answered.`,
    );
    if (q.type === "single" || q.type === "multi") {
      if (q.average !== null) lines.push("", `Average: ${q.average}`);
      lines.push("", "| Option | Count | Share |", "| --- | ---: | ---: |");
      for (const o of q.options) {
        lines.push(
          `| ${mdInline(o.label)} | ${whole.format(o.count)} | ${share.format(o.share)} |`,
        );
      }
      written(lines, "Other", q.otherTexts);
      written(lines, "Notes", q.notes);
    } else if (q.type === "number") {
      if (q.average !== null) {
        lines.push(
          "",
          "| Average | Median | Lowest | Highest |",
          "| ---: | ---: | ---: | ---: |",
          `| ${q.average} | ${q.median} | ${q.min} | ${q.max} |`,
        );
      }
    } else if (q.type === "person") {
      if (q.people.length > 0) {
        lines.push("", "| Person | Count | Share |", "| --- | ---: | ---: |");
        for (const p of q.people) {
          lines.push(
            `| ${mdInline(p.name)} | ${whole.format(p.count)} | ${share.format(p.share)} |`,
          );
        }
      }
    } else if (q.type === "text") {
      written(lines, null, q.texts);
    }
  }
  return `${lines.join("\n")}\n`;
}

function written(lines: string[], heading: string | null, texts: { text: string }[]) {
  if (texts.length === 0) return;
  lines.push("");
  if (heading) lines.push(`${heading}:`, "");
  for (const t of texts) lines.push(`- ${mdInline(t.text)}`);
}
