import { audienceReach, type SendFields } from "@/components/editor/send/send-logic";
import { SendSettings, type SettingsRowId } from "@/components/editor/send/send-settings";
import { Variants } from "../frame";
import {
  type Audience,
  defaults,
  four,
  fridayFive,
  groups,
  mondayNine,
  search,
  sizeOf,
  spread,
  three,
  WORKSPACE,
  yesterdayFive,
  zonesOf,
} from "./sending-fixtures";
import type { Group } from "./types";

function SettingsDemo({
  start,
  audience = four,
  openRow,
  channelsKnown = true,
}: {
  start: Partial<SendFields>;
  audience?: Audience;
  openRow?: SettingsRowId;
  channelsKnown?: boolean;
}) {
  return (
    <SendSettings
      className="w-full"
      defaultValue={{ ...defaults, ...start }}
      defaultOpenRow={openRow}
      reach={audienceReach(audience, sizeOf, WORKSPACE)}
      zones={zonesOf(audience.people)}
      tagSuggestions={["weekly", "design", "retro", "offsite", "hiring"]}
      knownChannels={channelsKnown ? groups.filter((g) => g.kind === "channel") : []}
      search={search}
    />
  );
}

export const whenAndHow: Group = {
  slug: "when-and-how",
  title: "Send settings",
  lede: "The sending page's settings: when it goes out and closes, named or anonymous answers, reminders, a live count and tags.",
  entries: [
    {
      slug: "send-settings",
      name: "SendSettings",
      source: "components/editor/send/send-settings.tsx",
      note: "One row per setting: when it sends and closes, named or anonymous answers, reminders, a live count in a channel, tags. Send later opens the day, the time, a box for each person's own time zone and when each zone gets it; Change opens one row at a time and a switch acts at once. A new setting is one more row.",
      Demo: () => (
        <Variants
          stack
          items={[
            { label: "The defaults", render: () => <SettingsDemo start={{}} /> },
            {
              label: "Later, in each person's time",
              note: "Monday 09:00 on each clock. The preview says when each zone gets it on yours.",
              render: () => (
                <SettingsDemo
                  start={{ sendAt: mondayNine, sendInRecipientTimeZone: true }}
                  audience={spread}
                  openRow="send"
                />
              ),
            },
            {
              label: "Later, in your time",
              note: "Everyone at once; zones outside their working day are flagged.",
              render: () => (
                <SettingsDemo start={{ sendAt: mondayNine }} audience={spread} openRow="send" />
              ),
            },
            {
              label: "A fixed close date",
              render: () => <SettingsDemo start={{ closesAt: fridayFive }} openRow="close" />,
            },
            {
              label: "A close date in the past",
              render: () => <SettingsDemo start={{ closesAt: yesterdayFive }} />,
            },
            {
              label: "Anonymous, under five people",
              render: () => <SettingsDemo start={{ anonymous: true }} audience={three} />,
            },
            {
              label: "Announced in a channel not named yet",
              note: "The draft has a channel the page has no name for: it still says so, and it can be cleared.",
              render: () => (
                <SettingsDemo
                  start={{ announceChannelId: "C0LDS" }}
                  openRow="announce"
                  channelsKnown={false}
                />
              ),
            },
            {
              label: "Announced, tagged, no reminders",
              render: () => (
                <SettingsDemo
                  start={{
                    announceChannelId: "C0LDS",
                    tags: ["weekly", "design"],
                    remindersEnabled: false,
                    closeAfterHours: 24,
                  }}
                />
              ),
            },
          ]}
        />
      ),
    },
  ],
};
