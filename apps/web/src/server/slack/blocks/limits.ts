/**
 * Slack's Block Kit limits, from https://docs.slack.dev/reference/block-kit. Slack refuses a
 * message or view that breaks one with `invalid_blocks`, so FakeSlack checks every payload
 * against these and every test that sends a message proves it would be accepted.
 */
export const blockKitLimits = {
  messageBlocks: 50,
  viewBlocks: 100,
  messageText: 40_000,
  blockId: 255,
  actionId: 255,
  sectionText: 3000,
  contextElements: 10,
  actionsElements: 25,
  buttonText: 75,
  buttonValue: 2000,
  url: 3000,
  optionText: 75,
  optionValue: 150,
  choiceOptions: 10,
  selectOptions: 100,
  inputLabel: 2000,
  placeholder: 150,
  textInputLength: 3000,
  viewTitle: 24,
  callbackId: 255,
  privateMetadata: 3000,
} as const;

type Surface = "message" | "modal" | "home";

interface TextObject {
  type?: string;
  text?: string;
}

interface Element {
  type?: string;
  action_id?: string;
  text?: TextObject;
  value?: string;
  url?: string;
  options?: { text?: TextObject; value?: string }[];
  placeholder?: TextObject;
  max_length?: number;
}

interface Block {
  type?: string;
  block_id?: string;
  text?: TextObject;
  elements?: (Element & TextObject)[];
  element?: Element;
  label?: TextObject;
}

/** Every way `blocks` breaks Slack's limits, empty when Slack would accept them. */
export function blockKitProblems(surface: Surface, blocks: unknown[], text?: string): string[] {
  const limits = blockKitLimits;
  const problems: string[] = [];
  const over = (what: string, length: number, max: number) => {
    if (length > max) problems.push(`${what} is ${length}, over Slack's ${max}`);
  };
  const plainText = (what: string, value: TextObject | undefined, max: number) => {
    if (!value || typeof value.text !== "string") return problems.push(`${what} has no text`);
    if (value.type !== "plain_text") problems.push(`${what} must be plain_text`);
    if (value.text.length === 0) problems.push(`${what} is empty`);
    over(`${what} length`, value.text.length, max);
  };

  over(
    "block count",
    blocks.length,
    surface === "message" ? limits.messageBlocks : limits.viewBlocks,
  );
  if (text !== undefined) {
    if (!text.trim()) problems.push("message text is empty; notifications read it");
    over("message text length", text.length, limits.messageText);
  }
  const blockIds = new Set<string>();

  for (const [index, raw] of blocks.entries()) {
    const block = raw as Block;
    // Slack wants each action_id unique within its block; across blocks it may repeat.
    const actionIds = new Set<string>();
    const at = `block ${index} (${block.type})`;
    if (block.block_id !== undefined) {
      over(`${at} block_id length`, block.block_id.length, limits.blockId);
      if (blockIds.has(block.block_id)) problems.push(`${at} repeats block_id ${block.block_id}`);
      blockIds.add(block.block_id);
    }
    const action = (element: Element, where: string) => {
      if (!element.action_id) return problems.push(`${where} has no action_id`);
      over(`${where} action_id length`, element.action_id.length, limits.actionId);
      if (actionIds.has(element.action_id)) {
        problems.push(`${where} repeats action_id ${element.action_id}`);
      }
      actionIds.add(element.action_id);
    };
    switch (block.type) {
      case "section":
        if (!block.text?.text) problems.push(`${at} has no text`);
        else over(`${at} text length`, block.text.text.length, limits.sectionText);
        break;
      case "context":
        over(`${at} elements`, block.elements?.length ?? 0, limits.contextElements);
        for (const element of block.elements ?? []) {
          over(`${at} text length`, element.text?.length ?? 0, limits.sectionText);
        }
        break;
      case "actions":
        if (!block.elements?.length) problems.push(`${at} has no elements`);
        over(`${at} elements`, block.elements?.length ?? 0, limits.actionsElements);
        for (const [i, element] of (block.elements ?? []).entries()) {
          const where = `${at} element ${i}`;
          action(element, where);
          if (element.type !== "button") continue;
          plainText(`${where} text`, element.text, limits.buttonText);
          if (element.value !== undefined) {
            over(`${where} value length`, element.value.length, limits.buttonValue);
          }
          if (element.url !== undefined)
            over(`${where} url length`, element.url.length, limits.url);
          if (element.value === undefined && element.url === undefined) {
            problems.push(`${where} has neither a value nor a url`);
          }
        }
        break;
      case "input": {
        if (surface === "message") problems.push(`${at} is an input, which only a view can hold`);
        plainText(`${at} label`, block.label, limits.inputLabel);
        if (!block.element) {
          problems.push(`${at} has no element`);
          break;
        }
        const element = block.element;
        action(element, `${at} element`);
        if (element.placeholder) {
          plainText(`${at} placeholder`, element.placeholder, limits.placeholder);
        }
        if (element.type === "plain_text_input" && element.max_length !== undefined) {
          over(`${at} max_length`, element.max_length, limits.textInputLength);
        }
        if (element.options) {
          const max =
            element.type === "radio_buttons" || element.type === "checkboxes"
              ? limits.choiceOptions
              : limits.selectOptions;
          over(`${at} options`, element.options.length, max);
          if (element.options.length === 0) problems.push(`${at} has no options`);
          for (const [i, option] of element.options.entries()) {
            plainText(`${at} option ${i}`, option.text, limits.optionText);
            over(`${at} option ${i} value length`, option.value?.length ?? 0, limits.optionValue);
          }
        }
        break;
      }
      default:
        problems.push(`${at} is a block type Holler does not build`);
    }
  }
  return problems;
}

/** The checks on a modal beyond its blocks. */
export function viewProblems(view: {
  type: string;
  blocks: unknown[];
  title?: TextObject;
  submit?: TextObject;
  close?: TextObject;
  callback_id?: string;
  private_metadata?: string;
}): string[] {
  const surface = view.type === "modal" ? "modal" : "home";
  const problems = blockKitProblems(surface, view.blocks);
  if (surface !== "modal") return problems;
  const limits = blockKitLimits;
  for (const [what, value] of [
    ["title", view.title],
    ["submit", view.submit],
    ["close", view.close],
  ] as const) {
    if (!value?.text || value.type !== "plain_text")
      problems.push(`modal ${what} needs plain_text`);
    else if (value.text.length > limits.viewTitle) {
      problems.push(`modal ${what} is ${value.text.length}, over Slack's ${limits.viewTitle}`);
    }
  }
  if ((view.callback_id?.length ?? 0) > limits.callbackId) problems.push("callback_id too long");
  if ((view.private_metadata?.length ?? 0) > limits.privateMetadata) {
    problems.push("private_metadata too long");
  }
  return problems;
}
