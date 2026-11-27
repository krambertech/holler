import { useState } from "react";
import { audienceReach, type SendFields } from "@/components/editor/send/send-logic";
import { SendSettings, type SettingsRowId } from "@/components/editor/send/send-settings";
import { WhenPicker } from "@/components/editor/send/when-picker";
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

function WhenDemo({
  start,
  audience = four,
  timeZone,
  problem,
}: {
  start?: Partial<SendFields>;
  audience?: Audience;
  timeZone?: string;
  problem?: string;
}) {
  const [value, setValue] = useState({ ...defaults, ...start });
  return (
    <WhenPicker
      className="w-full"
      value={value}
      onValueChange={(when) => setValue({ ...value, ...when })}
      reach={audienceReach(audience, sizeOf, WORKSPACE)}
      zones={zonesOf(audience.people)}
      timeZone={timeZone}
      problem={problem}
    />
  );
}

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
  title: "When and how",
  lede: "The rest of the sending page: when it goes out, and the settings that shape what happens after.",
  entries: [
    {
      slug: "when-picker",
      name: "WhenPicker",
      source: "components/editor/send/when-picker.tsx",
      note: "Now or later on one line. Later picks tomorrow at the start of the working day and opens the day, the time and whose clock right under it, then when each time zone gets it. A time that has passed says so under the plate.",
      Demo: () => (
        <Variants
          stack
          items={[
            { label: "Now, the default", render: () => <WhenDemo /> },
            {
              label: "Later, in each person's time",
              note: "Monday 09:00 on each clock. The preview says when each zone gets it on yours.",
              render: () => (
                <WhenDemo
                  start={{ sendAt: mondayNine, sendInRecipientTimeZone: true }}
                  audience={spread}
                />
              ),
            },
            {
              label: "Later, in your time",
              note: "Everyone at once; zones outside their working day are flagged.",
              render: () => <WhenDemo start={{ sendAt: mondayNine }} audience={spread} />,
            },
            {
              label: "The sender in New York",
              note: "The boxes read New York's clock, whatever this browser's is.",
              render: () => <WhenDemo start={{ sendAt: mondayNine }} timeZone="America/New_York" />,
            },
            {
              label: "A time that has passed",
              render: () => <WhenDemo start={{ sendAt: yesterdayFive }} />,
            },
          ]}
        />
      ),
    },
    {
      slug: "send-settings",
      name: "SendSettings",
      source: "components/editor/send/send-settings.tsx",
      note: "One row per setting: when it closes, named or anonymous answers, reminders, a live count in a channel, tags. Change opens one row at a time and a switch acts at once. A new setting is one more row.",
      Demo: () => (
        <Variants
          stack
          items={[
            { label: "The defaults", render: () => <SettingsDemo start={{}} /> },
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
