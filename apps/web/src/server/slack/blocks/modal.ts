import { type ResponseInput, slackLimits } from "@holler/core";
import type { SlackView } from "../client";
import {
  answerViewId,
  context,
  escapeMrkdwn,
  mrkdwn,
  plain,
  type SlackHoller,
  type SlackQuestion,
  section,
  sections,
} from "./format";

/**
 * The answer modal: one input block per question, then an "If Other, what?" block and a
 * follow-up note block where the question has them. The element per question type is the table
 * in docs/slack.md, In a modal.
 */

/** Where the modal came from, so the submit can update that DM in place. */
export interface AnswerViewOrigin {
  hollerId: string;
  /** The DM the Answer button was in. Empty when the modal opened from somewhere else. */
  channel: string;
  ts: string;
}

/** Block ids name what a block holds and its question: `q:`, `other:` or `note:` then the id. */
const blockIds = {
  question: (id: string) => `q:${id}`,
  other: (id: string) => `other:${id}`,
  note: (id: string) => `note:${id}`,
};
const valueAction = "value";

const count = new Intl.NumberFormat("en-GB");

/** A scale's words at each end go on its first and last option: "1, Chaos" and "5, Calm". */
function optionLabels(question: SlackQuestion) {
  const last = question.options.length - 1;
  return question.options.map((option, index) => {
    const word = index === 0 ? question.lowLabel : index === last ? question.highLabel : null;
    return { id: option.id, label: word ? `${option.label}, ${word}` : option.label };
  });
}

function element(question: SlackQuestion) {
  const limit = question.maxChoices === null ? {} : { max_selected_items: question.maxChoices };
  switch (question.type) {
    case "text":
      return {
        type: "plain_text_input",
        action_id: valueAction,
        multiline: true,
        max_length: 3000,
      };
    case "number":
      return {
        type: "number_input",
        action_id: valueAction,
        is_decimal_allowed: false,
        ...(question.numberMin === null ? {} : { min_value: String(question.numberMin) }),
        ...(question.numberMax === null ? {} : { max_value: String(question.numberMax) }),
      };
    case "person":
      return question.maxChoices === 1
        ? { type: "users_select", action_id: valueAction, placeholder: plain("Choose someone") }
        : {
            type: "multi_users_select",
            action_id: valueAction,
            placeholder: plain("Choose people"),
            ...limit,
          };
    case "single":
    case "multi": {
      const choices = [
        ...optionLabels(question),
        ...(question.otherOptionId ? [{ id: question.otherOptionId, label: "Other" }] : []),
      ].map((option) => ({ text: plain(option.label), value: option.id }));
      const inline = choices.length <= slackLimits.inlineOptions;
      if (question.type === "single") {
        return inline
          ? { type: "radio_buttons", action_id: valueAction, options: choices }
          : {
              type: "static_select",
              action_id: valueAction,
              options: choices,
              placeholder: plain("Choose"),
            };
      }
      return inline
        ? { type: "checkboxes", action_id: valueAction, options: choices }
        : {
            type: "multi_static_select",
            action_id: valueAction,
            options: choices,
            placeholder: plain("Choose any"),
            ...limit,
          };
    }
  }
}

function label(question: SlackQuestion) {
  if (question.type !== "multi" && question.type !== "person") return question.prompt;
  if (question.maxChoices === null || question.maxChoices === 1) return question.prompt;
  return `${question.prompt} Pick up to ${count.format(question.maxChoices)}.`;
}

function questionBlocks(question: SlackQuestion): unknown[] {
  const blocks: unknown[] = [
    {
      type: "input",
      block_id: blockIds.question(question.id),
      label: plain(label(question), 2000),
      optional: !question.required,
      ...(question.description.trim() ? { hint: plain(question.description, 2000) } : {}),
      element: element(question),
    },
  ];
  if (question.otherOptionId) {
    blocks.push({
      type: "input",
      block_id: blockIds.other(question.id),
      label: plain("If Other, what?"),
      optional: true,
      element: { type: "plain_text_input", action_id: valueAction, max_length: 1000 },
    });
  }
  if (question.followUp) {
    blocks.push({
      type: "input",
      block_id: blockIds.note(question.id),
      label: plain(question.followUp.prompt, 2000),
      optional: true,
      element: {
        type: "plain_text_input",
        action_id: valueAction,
        multiline: true,
        max_length: 3000,
      },
    });
  }
  return blocks;
}

export function answerModal(holler: SlackHoller, origin: AnswerViewOrigin): SlackView {
  const blocks: unknown[] = [section(`*${escapeMrkdwn(holler.title)}*`)];
  if (holler.description.trim()) blocks.push(...sections(mrkdwn(holler.description)));
  if (holler.anonymous) blocks.push(context("Anonymous. Your name is not kept with your answers."));
  for (const question of holler.questions) blocks.push(...questionBlocks(question));
  return {
    type: "modal",
    callback_id: answerViewId,
    private_metadata: JSON.stringify(origin),
    title: plain("Answer", 24),
    submit: plain("Send", 24),
    close: plain("Cancel", 24),
    blocks,
  };
}

export function readOrigin(privateMetadata: string | undefined): AnswerViewOrigin | null {
  try {
    const parsed = JSON.parse(privateMetadata ?? "") as Partial<AnswerViewOrigin>;
    if (typeof parsed.hollerId !== "string") return null;
    return { hollerId: parsed.hollerId, channel: parsed.channel ?? "", ts: parsed.ts ?? "" };
  } catch {
    return null;
  }
}

/** One element's state, as Slack sends it in `view.state.values`. */
export interface StateValue {
  type?: string;
  value?: string | null;
  selected_option?: { value: string } | null;
  selected_options?: { value: string }[];
  selected_user?: string | null;
  selected_users?: string[];
}

type Answer = ResponseInput["answers"][number];

/** The modal's state as a response, the shape recordResponse checks. */
export function readAnswers(
  values: Record<string, Record<string, StateValue>> | undefined,
): ResponseInput {
  const byQuestion = new Map<string, Answer>();
  const answerFor = (questionId: string) => {
    let answer = byQuestion.get(questionId);
    if (!answer) {
      answer = { questionId };
      byQuestion.set(questionId, answer);
    }
    return answer;
  };
  for (const [blockId, actions] of Object.entries(values ?? {})) {
    const state = actions[valueAction];
    const [kind, questionId] = blockId.split(":");
    if (!state || !questionId) continue;
    const text = state.value?.trim() || null;
    if (kind === "other") answerFor(questionId).otherText = text;
    else if (kind === "note") answerFor(questionId).note = text;
    else if (kind === "q") Object.assign(answerFor(questionId), readElement(state, text));
  }
  return { answers: [...byQuestion.values()] };
}

function readElement(state: StateValue, text: string | null): Partial<Answer> {
  switch (state.type) {
    case "plain_text_input":
      return { text };
    case "number_input":
      // Slack sends the number as text; one that is not whole is left for recordResponse to refuse.
      return { number: text === null ? null : Number(text) };
    case "users_select":
      return { slackUserIds: state.selected_user ? [state.selected_user] : [] };
    case "multi_users_select":
      return { slackUserIds: state.selected_users ?? [] };
    case "checkboxes":
    case "multi_static_select":
      return { optionIds: (state.selected_options ?? []).map((o) => o.value) };
    default:
      return { optionIds: state.selected_option ? [state.selected_option.value] : [] };
  }
}

/** The block a question's error belongs beside, for Slack's `response_action: "errors"`. */
export const errorBlockFor = blockIds.question;
