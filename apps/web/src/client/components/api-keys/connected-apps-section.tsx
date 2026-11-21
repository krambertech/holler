import type { ConnectedAppOut } from "@holler/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Plate, PlateRow, PlateStrip } from "@/components/ui/plate";
import { ApiError } from "@/lib/api";
import { CopyButton, DOCS_URL, SettingsSection, whenLabel } from "./parts";
import { connectedAppsQuery, disconnectApp } from "./queries";

/** The address an MCP client is given. It is this app's own origin. */
const mcpUrl = () => `${window.location.origin}/mcp`;

/** Settings → Connected apps: the assistants the member let in, what each may do, and revoke. */
export function ConnectedAppsSection() {
  const apps = useQuery(connectedAppsQuery);
  return (
    <SettingsSection
      id="settings-connected-apps"
      title="Connected apps"
      description={
        <>
          Assistants such as Claude or ChatGPT can use Holler for you. Each one asks you first, and
          works only in this workspace.{" "}
          <a
            href={`${DOCS_URL}#connect-an-assistant-over-mcp`}
            className="text-ink underline underline-offset-2 hover:text-primary"
          >
            Read how to connect one
          </a>
        </>
      }
    >
      {apps.isError ? (
        <Plate className="px-5 py-4 text-danger-ink">
          Unable to load your connected apps. Refresh the page to try again.
        </Plate>
      ) : apps.data ? (
        <Plate>
          {apps.data.length === 0 ? (
            <PlateRow className="px-5 py-4 text-ink-2">
              You have not connected any apps. Add Holler to an assistant with the address below.
            </PlateRow>
          ) : (
            apps.data.map((app) => <AppRow key={app.id} app={app} />)
          )}
          <PlateStrip>
            <span className="min-w-0">
              MCP server: <span className="whitespace-nowrap font-mono">{mcpUrl()}</span>
            </span>
            <CopyButton text={mcpUrl()} label="Copy the MCP server address" />
          </PlateStrip>
        </Plate>
      ) : (
        <Plate aria-hidden className="h-[120px] animate-pulse" />
      )}
    </SettingsSection>
  );
}

/** A client registered without a name is known by its client id, which is often its site. */
function appName(app: ConnectedAppOut): string {
  if (app.name) return app.name;
  try {
    return new URL(app.clientId).host;
  } catch {
    return "An unnamed app";
  }
}

function AppRow({ app }: { app: ConnectedAppOut }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  // The button that opened the confirm is gone, so focus lands on Cancel, the safe choice.
  const focusCancel = useCallback(
    (row: HTMLDivElement | null) => row?.querySelector("button")?.focus(),
    [],
  );
  const name = appName(app);
  const disconnect = useMutation({
    mutationFn: () => disconnectApp(app.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectedAppsQuery.queryKey }),
  });
  const errorId = `app-error-${app.id}`;
  return (
    <PlateRow className="flex flex-col gap-2 px-5 py-3.5">
      {confirming ? (
        <div ref={focusCancel} className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1">
            Disconnect {name}? It stops working at once and has to ask you again.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              pending={disconnect.isPending}
              onClick={() => disconnect.mutate()}
              aria-describedby={disconnect.isError ? errorId : undefined}
            >
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate font-normal text-md">{name}</span>
              <Chip tone={app.scope === "write" ? "tint" : "quiet"}>
                {app.scope === "write" ? "Read and write" : "Read only"}
              </Chip>
            </span>
            <span className="text-muted text-sm">
              {app.scope === "write"
                ? "Can read your hollers and results, make and edit drafts, and send after you confirm."
                : "Can read your hollers and their results."}
            </span>
            <span className="text-muted text-sm">
              {app.lastUsedAt
                ? `Connected ${whenLabel(app.connectedAt)} · Last used ${whenLabel(app.lastUsedAt)}`
                : `Connected ${whenLabel(app.connectedAt)}`}
            </span>
          </div>
          <Button size="sm" onClick={() => setConfirming(true)} aria-label={`Disconnect ${name}`}>
            Disconnect
          </Button>
        </div>
      )}
      {disconnect.isError && (
        <p id={errorId} role="alert" className="text-danger-ink text-sm">
          {disconnect.error instanceof ApiError
            ? disconnect.error.message
            : "Unable to disconnect the app. Check your connection and try again."}
        </p>
      )}
    </PlateRow>
  );
}
