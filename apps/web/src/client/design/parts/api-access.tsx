import { CopyButton, SettingsSection } from "@/components/api-keys/parts";
import { Plate, PlateRow, PlateStrip } from "@/components/ui/plate";
import { Variants } from "../frame";
import type { Group } from "./types";

export const apiAccess: Group = {
  slug: "api-access",
  title: "API access",
  lede: "How a member reaches Holler from outside: API keys for scripts, and connected apps for assistants over MCP. Both sections load their own data, so Settings places them with one line.",
  entries: [
    {
      slug: "settings-section",
      name: "SettingsSection",
      source: "components/api-keys/parts.tsx",
      covers: ["ApiAccessSections", "ApiKeysSection", "ConnectedAppsSection"],
      note: "A heading, one line on what the section is for, then its plate. ApiKeysSection and ConnectedAppsSection are built from it; see them working on Settings.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "A section",
              render: () => (
                <SettingsSection
                  className="w-full"
                  id="design-connected-apps"
                  title="Connected apps"
                  description="Assistants such as Claude or ChatGPT can use Holler for you. Each one asks you first."
                >
                  <Plate>
                    <PlateRow className="px-5 py-4 text-ink-2">
                      You have not connected any apps. Add Holler to an assistant with the address
                      below.
                    </PlateRow>
                    <PlateStrip>
                      <span className="min-w-0">
                        MCP server:{" "}
                        <span className="whitespace-nowrap font-mono">app.holler.team/mcp</span>
                      </span>
                      <CopyButton
                        text="https://app.holler.team/mcp"
                        aria-label="Copy the MCP server address"
                      />
                    </PlateStrip>
                  </Plate>
                </SettingsSection>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "copy-button",
      name: "CopyButton",
      source: "components/api-keys/parts.tsx",
      note: "Copies, says Copied for two seconds, and says it out loud too. When the clipboard refuses, it asks the person to copy the text themselves.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Copy",
              render: () => (
                <CopyButton text="hlr_live_example" aria-label="Copy the key Weekly pulse script" />
              ),
            },
          ]}
        />
      ),
    },
  ],
};
