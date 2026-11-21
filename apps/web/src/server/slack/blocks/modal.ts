import type { ResponseInput } from "@holler/core";
import type { SlackView } from "../client";
import {
  answerViewId,
  choiceLimit,
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
 * The answer modal: one input block per question. Radio buttons and checkboxes up to 10 options,
 * a select menu above that. docs/slack.md, Answering.
 */

/** Where the modal came from, so the submit can update that DM in place. */
export interface AnswerViewOrigin {
  hollerId: string;
  /** The DM the Answer button was in. Empty when the modal opened from somewhere else. */
  channel: string;
  ts: string;
}

const blockFor = (questionId: string) => `q:${questionId}`;
const valueAction = "value";

function element(question: SlackQuestion) {
  const options = question.options.map((option) => ({
    text: plain(option.label),
    value: option.id,
  }));
  if (question.type === "text") {
    return {
      type: "plain_text_input",
      action_id: valueAction,
      multiline: true,
      max_length: 3000,
    };
  }
  const many = question.options.length > choiceLimit;
  if (question.type === "single") {
    return many
      ? { type: "static_select", action_id: valueAction, options, placeholder: plain("Choose") }
      : { type: "radio_buttons", action_id: valueAction, options };
  }
  return many
    ? {
        type: "multi_static_select",
        action_id: valueAction,
        options,
        placeholder: plain("Choose any"),
      }
    : { type: "checkboxes", action_id: valueAction, options };
}

export function answerModal(holler: SlackHoller, origin: AnswerViewOrigin): SlackView {
  const blocks: unknown[] = [section(`*${escapeMrkdwn(holler.title)}*`)];
  if (holler.description.trim()) blocks.push(...sections(mrkdwn(holler.description)));
  if (holler.anonymous) blocks.push(context("Anonymous. Your name is not kept with your answers."));
  for (const question of holler.questions) {
    blocks.push({
      type: "input",
      block_id: blockFor(question.id),
      label: plain(question.prompt, 2000),
      optional: !question.required,
      element: element(question),
    });
  }
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

interface StateValue {
  type?: string;
  value?: string | null;
  selected_option?: { value: string } | null;
  selected_options?: { value: string }[];
}

/** The modal's state as a response, the shape recordResponse checks. */
export function readAnswers(
  values: Record<string, Record<string, StateValue>> | undefined,
): ResponseInput {
  const answers: ResponseInput["answers"] = [];
  for (const [blockId, actions] of Object.entries(values ?? {})) {
    if (!blockId.startsWith("q:")) continue;
    const state = actions[valueAction];
    if (!state) continue;
    const questionId = blockId.slice(2);
    if (state.type === "plain_text_input") {
      answers.push({ questionId, text: state.value ?? null });
    } else if (state.selected_options) {
      answers.push({ questionId, optionIds: state.selected_options.map((o) => o.value) });
    } else {
      answers.push({
        questionId,
        optionIds: state.selected_option ? [state.selected_option.value] : [],
      });
    }
  }
  return { answers };
}

/** The block a question's error belongs beside, for Slack's `response_action: "errors"`. */
export const errorBlockFor = blockFor;
