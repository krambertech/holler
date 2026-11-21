import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Logo } from "@/components/logo";
import { WorkspaceIcon } from "@/components/settings/workspace-icon";
import { Button } from "@/components/ui/button";
import { Plate, PlateRow } from "@/components/ui/plate";
import { authClient } from "@/lib/auth-client";
import { meQuery } from "@/lib/queries";

export const Route = createFileRoute("/consent")({
  validateSearch: z.object({
    client_id: z.string().optional().catch(undefined),
    scope: z.string().optional().catch(undefined),
  }),
  component: Consent,
});

type Outcome = "allowed" | "refused";

/**
 * The OAuth consent stop. An MCP client (Claude, ChatGPT) sent the member here from its
 * sign-in. Read is what a connection needs to work at all; write is ticked when the app asks
 * for it and the member can untick it. The decision does not end the page: a custom-scheme
 * redirect hands off to the app and leaves this tab open, so it shows the outcome instead.
 */
function Consent() {
  const { client_id: clientId, scope } = Route.useSearch();
  const me = useQuery({ ...meQuery, retry: false });
  const requested = new Set((scope ?? "").split(" ").filter(Boolean));
  const asksWrite = requested.has("write");
  const [allowWrite, setAllowWrite] = useState(asksWrite);
  const [busy, setBusy] = useState<"allow" | "refuse" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const client = useQuery({
    queryKey: ["oauth-client", clientId],
    enabled: Boolean(clientId),
    retry: false,
    queryFn: async () => {
      const res = await authClient.oauth2.publicClient({ query: { client_id: clientId ?? "" } });
      if (res.error) throw new Error(res.error.message ?? "Unable to load the app's details.");
      return res.data as { client_name?: string; client_uri?: string } | null;
    },
  });
  const appName = client.data?.client_name ?? hostOf(clientId) ?? "This app";

  async function decide(accept: boolean) {
    setError(null);
    setBusy(accept ? "allow" : "refuse");
    const granted = [...requested].filter((s) => s !== "write" || allowWrite);
    // The endpoint reads `scope` as "narrow the request to these"; leave it out when unchanged.
    const narrowed = accept && granted.length < requested.size;
    try {
      const res = await authClient.oauth2.consent({
        accept,
        ...(narrowed ? { scope: granted.join(" ") } : {}),
      });
      if (res.error) {
        setBusy(null);
        setError(
          !res.error.status || res.error.status >= 500
            ? "Unable to reach Holler. Check your connection and try again."
            : "Unable to save your choice. Start again from the app.",
        );
        return;
      }
      const target = redirectOf(res.data);
      if (!target) {
        setBusy(null);
        setError("The app did not say where to go next. Start again from the app.");
        return;
      }
      setOutcome(accept ? "allowed" : "refused");
      window.location.assign(target);
    } catch {
      setBusy(null);
      setError("Unable to reach Holler. Check your connection and try again.");
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[480px] place-items-center px-4 py-10">
      <Plate className="w-full">
        <PlateRow className="flex flex-col gap-5 px-7 pt-8 pb-6">
          <Logo />
          {outcome ? (
            <Done appName={appName} outcome={outcome} />
          ) : (
            <>
              <div>
                <h1 className="text-balance text-4xl tracking-title">
                  {client.isPending && clientId
                    ? "Connect an app to Holler"
                    : `Allow ${appName} to use Holler?`}
                </h1>
                {me.data && (
                  <p className="mt-3 flex items-center gap-3 text-ink-2">
                    <WorkspaceIcon
                      name={me.data.workspace.name}
                      src={me.data.workspace.iconUrl}
                      size="md"
                    />
                    <span>
                      It acts as {me.data.member.name}, in {me.data.workspace.name} only.
                    </span>
                  </p>
                )}
              </div>
              <ul className="flex flex-col gap-3">
                <li className="flex gap-3">
                  <Check
                    aria-hidden
                    strokeWidth={2}
                    className="mt-0.5 size-[18px] shrink-0 text-primary"
                  />
                  <span>
                    See your hollers, who answered and the results. Anonymous results stay hidden
                    until five people answer.
                  </span>
                </li>
                {asksWrite && (
                  <li>
                    {/* oxlint-disable-next-line jsx-a11y/label-has-associated-control -- the text is two spans deep, past where the rule looks */}
                    <label className="flex cursor-pointer gap-3">
                      <input
                        type="checkbox"
                        checked={allowWrite}
                        onChange={(event) => setAllowWrite(event.target.checked)}
                        className="mt-1 size-4 shrink-0 accent-primary"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span>Make, edit and send hollers, and send reminders</span>
                        <span className="text-muted text-sm">
                          Sending takes two steps, so the app can show you who a Holler reaches
                          before it goes.
                        </span>
                      </span>
                    </label>
                  </li>
                )}
              </ul>
            </>
          )}
        </PlateRow>
        {!outcome && (
          <PlateRow className="flex flex-col gap-3 px-7 py-5">
            {(error || !clientId) && (
              <p role="alert" className="text-danger-ink text-sm">
                {error ?? "This link is missing the app that asked. Start again from the app."}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                pending={busy === "refuse"}
                disabled={!clientId || busy === "allow"}
                onClick={() => decide(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                pending={busy === "allow"}
                disabled={!clientId || busy === "refuse"}
                onClick={() => decide(true)}
              >
                Allow
              </Button>
            </div>
            <p className="text-muted text-sm">
              You can disconnect it at any time in{" "}
              <Link
                to="/settings"
                className="text-ink underline underline-offset-2 hoverable:hover:text-primary"
              >
                Settings
              </Link>
              .
            </p>
          </PlateRow>
        )}
      </Plate>
    </main>
  );
}

function Done({ appName, outcome }: { appName: string; outcome: Outcome }) {
  return (
    <div role="status" className="flex flex-col gap-4">
      <h1 className="text-balance text-4xl tracking-title">
        {outcome === "allowed" ? `${appName} is connected` : `${appName} was not connected`}
      </h1>
      <p className="text-ink-2">
        {outcome === "allowed"
          ? `You can go back to ${appName}. If it did not open, switch to it yourself.`
          : "Nothing was shared with it. You can close this tab."}
      </p>
      {outcome === "allowed" && (
        <Button className="self-start" render={<Link to="/settings" />}>
          Manage connected apps
        </Button>
      )}
    </div>
  );
}

function hostOf(clientId: string | undefined): string | null {
  if (!clientId) return null;
  try {
    return new URL(clientId).host;
  } catch {
    return null;
  }
}

/** The consent endpoint answers with the client's redirect, under one of two names. */
function redirectOf(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  if ("url" in data && typeof data.url === "string") return data.url;
  if ("redirect_uri" in data && typeof data.redirect_uri === "string") return data.redirect_uri;
  return null;
}
