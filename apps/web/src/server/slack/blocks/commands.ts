import type { PostMessage } from "../client";
import { actionIds, context, escapeMrkdwn, plain, section, when } from "./format";
import type { HomeLive } from "./home";

/**
 * What /holler answers in the channel, only to the person who typed it. Slack shows these as
 * ephemeral messages, with the same limits as any message. docs/slack.md, `/holler`.
 */
export type Ephemeral = Omit<PostMessage, "channel"> & { response_type: "ephemeral" };

interface Reader {
  timeZone: string | null;
  now: Date;
  productUrl: string;
}

const count = new Intl.NumberFormat("en-GB");

const linkButton = (text: string, url: string, actionId: string = actionIds.productLink) => ({
  type: "button",
  action_id: actionId,
  text: plain(text),
  url,
});

/** `/holler results`: the person's live hollers with their counts. */
export function resultsMessage(
  sender: { live: HomeLive[]; moreLive: number },
  reader: Reader,
): Ephemeral {
  if (sender.live.length === 0) {
    return {
      response_type: "ephemeral",
      text: "You have nothing live right now.",
      blocks: [section("You have nothing live right now. Type `/holler` to send a quick pulse.")],
    };
  }
  const blocks: unknown[] = [section("*Your live hollers*")];
  for (const row of sender.live) {
    const parts = [`${count.format(row.answered)} of ${count.format(row.recipients)} answered`];
    if (row.closesAt) parts.push(`Closes ${when(row.closesAt, reader.timeZone, reader.now)}`);
    blocks.push({
      type: "section",
      block_id: `results:${row.id}`,
      text: { type: "mrkdwn", text: `*${escapeMrkdwn(row.title)}*\n${parts.join(" · ")}` },
      accessory: linkButton(
        "See results",
        `${reader.productUrl}/hollers/${row.id}`,
        actionIds.resultsLink,
      ),
    });
  }
  if (sender.moreLive === 1) {
    blocks.push(context(`And 1 more. <${reader.productUrl}|See it in Holler>`));
  } else if (sender.moreLive > 1) {
    blocks.push(
      context(
        `And ${count.format(sender.moreLive)} more. <${reader.productUrl}|See them in Holler>`,
      ),
    );
  }
  const total = sender.live.length + sender.moreLive;
  return {
    response_type: "ephemeral",
    text: total === 1 ? "You have 1 live Holler." : `You have ${count.format(total)} live hollers.`,
    blocks,
  };
}

export function helpMessage(): Ephemeral {
  const text =
    "`/holler` opens a quick pulse. Add a question to start with it, as in `/holler How was your week?`\n`/holler results` lists your live hollers and how many answered.";
  return { response_type: "ephemeral", text, blocks: [section(text)] };
}

/** For someone who has not signed in to Holler: they answer hollers, but sending needs a member. */
export function signInMessage(productUrl: string): Ephemeral {
  const text = "To send hollers and see results from Slack, sign in to Holler once with Slack.";
  return {
    response_type: "ephemeral",
    text,
    blocks: [
      section(text),
      {
        type: "actions",
        block_id: "sign-in",
        elements: [linkButton("Sign in to Holler", `${productUrl}/sign-in`)],
      },
    ],
  };
}
