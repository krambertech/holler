import {
  type HollerDraftInput,
  productPath,
  type QuestionInput,
  questionTemplates,
} from "@holler/core";
import type { SlackView } from "../client";
import { actionIds, context, escapeMrkdwn, plain, quickPulseViewId, section, when } from "./format";
import type { StateValue } from "./modal";

export const quickKinds = [
  { id: "options", label: "Options you write" },
  { id: "binary", label: "Yes or no" },
  { id: "rating", label: "Rating, 1 to 5" },
  { id: "agreement", label: "Agreement, disagree to agree" },
  { id: "text", label: "Free text" },
] as const;
export type QuickKind = (typeof quickKinds)[number]["id"];

export const quickCloses = [
  { hours: 24, label: "In 1 day" },
  { hours: 72, label: "In 3 days" },
  { hours: 168, label: "In 1 week" },
] as const;

export const quickBlocks = {
  prompt: "quick:prompt",
  kind: "quick:kind",
  options: "quick:options",
  people: "quick:people",
  channels: "quick:channels",
  closes: "quick:closes",
  anonymous: "quick:anonymous",
} as const;
const valueAction = "value";

export interface QuickPulseOrigin {
  about: { url: string } | null;
}

export interface QuickPulseValues {
  prompt: string;
  kind: QuickKind;
  options: string;
  people: string[];
  channels: string[];
  closeHours: number;
  anonymous: boolean;
}

export const emptyQuickPulse: QuickPulseValues = {
  prompt: "",
  kind: "options",
  options: "",
  people: [],
  channels: [],
  closeHours: 72,
  anonymous: false,
};

const kindOption = (kind: (typeof quickKinds)[number]) => ({
  text: plain(kind.label),
  value: kind.id,
});
const closeOption = (close: (typeof quickCloses)[number]) => ({
  text: plain(close.label),
  value: String(close.hours),
});
const anonymousOption = {
  text: plain("Anonymous"),
  description: plain("You see how many answered, never who.", 75),
  value: "anonymous",
};

export function quickPulseModal(
  origin: QuickPulseOrigin,
  values: QuickPulseValues,
  productUrl: string,
): SlackView {
  const kind = quickKinds.find((k) => k.id === values.kind) ?? quickKinds[0];
  const close = quickCloses.find((c) => c.hours === values.closeHours) ?? quickCloses[1];
  const blocks: unknown[] = [];
  if (origin.about) {
    blocks.push(context(`About <${origin.about.url}|this message>. The link goes in the Holler.`));
  }
  blocks.push(
    {
      type: "input",
      block_id: quickBlocks.prompt,
      label: plain("Question"),
      element: {
        type: "plain_text_input",
        action_id: valueAction,
        max_length: 300,
        placeholder: plain("How was your week?"),
        ...(values.prompt ? { initial_value: values.prompt } : {}),
      },
    },
    {
      type: "input",
      block_id: quickBlocks.kind,
      label: plain("Answers"),
      dispatch_action: true,
      element: {
        type: "static_select",
        action_id: actionIds.quickKind,
        options: quickKinds.map(kindOption),
        initial_option: kindOption(kind),
      },
    },
  );
  if (kind.id === "options") {
    blocks.push({
      type: "input",
      block_id: quickBlocks.options,
      label: plain("Options"),
      hint: plain("One per line. People answer with one tap in the DM."),
      element: {
        type: "plain_text_input",
        action_id: valueAction,
        multiline: true,
        max_length: 3000,
        placeholder: plain("Great\nFine\nRough"),
        ...(values.options ? { initial_value: values.options } : {}),
      },
    });
  }
  blocks.push(
    {
      type: "input",
      block_id: quickBlocks.people,
      label: plain("Send to"),
      optional: true,
      element: {
        type: "multi_users_select",
        action_id: valueAction,
        placeholder: plain("Choose people"),
        ...(values.people.length ? { initial_users: values.people } : {}),
      },
    },
    {
      type: "input",
      block_id: quickBlocks.channels,
      label: plain("And everyone in"),
      optional: true,
      hint: plain("Each member of these channels gets their own DM."),
      element: {
        type: "multi_channels_select",
        action_id: valueAction,
        placeholder: plain("Choose channels"),
        ...(values.channels.length ? { initial_channels: values.channels } : {}),
      },
    },
    {
      type: "input",
      block_id: quickBlocks.closes,
      label: plain("Closes"),
      element: {
        type: "static_select",
        action_id: valueAction,
        options: quickCloses.map(closeOption),
        initial_option: closeOption(close),
      },
    },
    {
      type: "input",
      block_id: quickBlocks.anonymous,
      label: plain("Answers are"),
      optional: true,
      element: {
        type: "checkboxes",
        action_id: valueAction,
        options: [anonymousOption],
        ...(values.anonymous ? { initial_options: [anonymousOption] } : {}),
      },
    },
    {
      type: "section",
      block_id: "quick:more",
      text: { type: "mrkdwn", text: "More questions, a schedule or a form to chase?" },
      accessory: {
        type: "button",
        action_id: actionIds.productLink,
        text: plain("Open in Holler"),
        url: `${productUrl}${productPath("/")}`,
      },
    },
  );
  return {
    type: "modal",
    callback_id: quickPulseViewId,
    private_metadata: JSON.stringify(origin),
    title: plain("New pulse", 24),
    submit: plain("Send", 24),
    close: plain("Cancel", 24),
    blocks,
  };
}

export function readQuickOrigin(privateMetadata: string | undefined): QuickPulseOrigin {
  try {
    const parsed = JSON.parse(privateMetadata ?? "") as Partial<QuickPulseOrigin>;
    const url = parsed.about?.url;
    return { about: typeof url === "string" && /^https:\/\//.test(url) ? { url } : null };
  } catch {
    return { about: null };
  }
}

export function readQuickValues(
  values: Record<string, Record<string, StateValue>> | undefined,
): QuickPulseValues {
  const of = (block: string, action = valueAction) => values?.[block]?.[action];
  const kind = of(quickBlocks.kind, actionIds.quickKind)?.selected_option?.value;
  const hours = Number(of(quickBlocks.closes)?.selected_option?.value);
  return {
    prompt: of(quickBlocks.prompt)?.value?.trim() ?? "",
    kind: quickKinds.find((k) => k.id === kind)?.id ?? "options",
    options: of(quickBlocks.options)?.value ?? "",
    people: of(quickBlocks.people)?.selected_users ?? [],
    channels: of(quickBlocks.channels)?.selected_channels ?? [],
    closeHours: quickCloses.find((c) => c.hours === hours)?.hours ?? 72,
    anonymous: (of(quickBlocks.anonymous)?.selected_options ?? []).length > 0,
  };
}

function questionFor(values: QuickPulseValues): QuestionInput {
  if (values.kind === "options") {
    const labels = values.options
      .split("\n")
      .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
      .filter(Boolean);
    return {
      type: "single",
      prompt: values.prompt,
      options: labels.map((label) => ({ label })),
    };
  }
  const preset = questionTemplates.find((t) => t.id === values.kind);
  if (!preset) throw new Error(`No question template ${values.kind}`);
  return {
    type: preset.type,
    style: preset.style,
    prompt: values.prompt,
    options: preset.options.map((o) => ({ ...o })),
    ...(preset.lowLabel ? { lowLabel: preset.lowLabel, highLabel: preset.highLabel } : {}),
  };
}

export function quickPulseDraft(
  origin: QuickPulseOrigin,
  values: QuickPulseValues,
): { draft: HollerDraftInput } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const question = questionFor(values);
  if (!values.prompt) errors[quickBlocks.prompt] = "Write the question.";
  if (values.kind === "options" && (question.options?.length ?? 0) < 2) {
    errors[quickBlocks.options] = "Write at least two options, one on each line.";
  } else if (values.kind === "options" && (question.options?.length ?? 0) > 25) {
    errors[quickBlocks.options] =
      "A quick pulse takes up to 25 options. Open it in Holler for more.";
  } else if (question.options?.some((o) => o.label.length > 75)) {
    errors[quickBlocks.options] = "Keep each option under 75 characters, so it fits a button.";
  }
  if (values.people.length === 0 && values.channels.length === 0) {
    errors[quickBlocks.people] = "Choose people or a channel to send it to.";
  }
  if (Object.keys(errors).length > 0) return { errors };
  return {
    draft: {
      mode: "pulse",
      title: "",
      description: origin.about ? `About [this message](${origin.about.url}).` : "",
      anonymous: values.anonymous,
      audience: { people: values.people, groups: values.channels, everyone: false },
      closeAfterHours: values.closeHours,
      questions: [question],
    },
  };
}

export function quickBlockFor(field: string | null | undefined): string {
  if (!field) return quickBlocks.prompt;
  if (field === "audience") return quickBlocks.people;
  if (/^questions\.0\.options/.test(field)) return quickBlocks.options;
  return quickBlocks.prompt;
}

const resultView = (title: string, blocks: unknown[]): SlackView => ({
  type: "modal",
  callback_id: `${quickPulseViewId}_done`,
  title: plain(title, 24),
  close: plain("Done", 24),
  blocks,
});

export function quickSendingView(prompt: string): SlackView {
  return resultView("New pulse", [section(`Sending *${escapeMrkdwn(prompt)}*…`)]);
}

export interface QuickSent {
  hollerId: string;
  prompt: string;
  recipients: number;
  closesAt: Date | null;
}

export function quickSentView(
  sent: QuickSent,
  reader: { timeZone: string | null; now: Date },
  productUrl: string,
): SlackView {
  const prompt = `*${escapeMrkdwn(sent.prompt)}*`;
  const closes = sent.closesAt
    ? ` It closes ${when(sent.closesAt, reader.timeZone, reader.now)}.`
    : "";
  const line =
    sent.recipients === 1
      ? `${prompt} went to 1 person.${closes}`
      : `${prompt} went to ${new Intl.NumberFormat("en-GB").format(sent.recipients)} people.${closes}`;
  return resultView("Pulse sent", [
    section(line),
    context("Answers show up on your Holler Home in Slack and in Holler."),
    {
      type: "actions",
      block_id: `quick:sent:${sent.hollerId}`,
      elements: [
        {
          type: "button",
          action_id: actionIds.resultsLink,
          text: plain("See results"),
          url: `${productUrl}${productPath("/hollers/$id", { params: { id: sent.hollerId } })}`,
        },
      ],
    },
  ]);
}

export function quickFailedView(
  failed: { hollerId: string | null; message: string },
  productUrl: string,
): SlackView {
  const saved = failed.hollerId !== null;
  return resultView("Not sent", [
    section(`${escapeMrkdwn(failed.message)}`),
    ...(saved ? [context("Your pulse is saved as a draft.")] : []),
    {
      type: "actions",
      block_id: `quick:failed:${failed.hollerId ?? "unsaved"}`,
      elements: [
        {
          type: "button",
          action_id: actionIds.productLink,
          text: plain("Open in Holler"),
          url: `${productUrl}${failed.hollerId ? productPath("/hollers/$id", { params: { id: failed.hollerId } }) : productPath("/")}`,
        },
      ],
    },
  ]);
}

export function signInView(productUrl: string): SlackView {
  return resultView("Holler", [
    section("To send hollers from Slack, sign in to Holler once with Slack."),
    {
      type: "actions",
      block_id: "quick:sign-in",
      elements: [
        {
          type: "button",
          action_id: actionIds.productLink,
          text: plain("Sign in to Holler"),
          url: `${productUrl}${productPath("/sign-in")}`,
        },
      ],
    },
  ]);
}
