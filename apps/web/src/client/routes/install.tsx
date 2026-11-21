import type { InstallStatus } from "@holler/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { authClient } from "@/lib/auth-client";
import { installStatusQuery } from "@/lib/queries";

const problems = ["denied", "expired", "enterprise", "failed", "not_configured"] as const;
type Problem = (typeof problems)[number];

export const Route = createFileRoute("/install")({
  validateSearch: z.object({
    installed: z.coerce.boolean().optional().catch(undefined),
    problem: z.enum(problems).optional().catch(undefined),
  }),
  component: Install,
});

/** What went wrong on the way back from Slack, and what to do about it. */
const problemText: Record<Exclude<Problem, "enterprise">, string> = {
  denied: "You cancelled on Slack's page, so nothing was installed. Add Holler when you are ready.",
  expired: "That install took too long or started somewhere else. Start it again from here.",
  failed: "Slack did not finish the install. Try again in a minute.",
  not_configured: "Slack is not set up on this server yet. Add the Slack app's keys to .dev.vars.",
};

/**
 * "Add to Slack", and where Slack sends people back after it. Someone signed in to a workspace
 * without Holler lands here too. After a successful install the page goes straight on to Sign in
 * with Slack, so installing and signing in feel like one step. docs/slack.md.
 */
function Install() {
  const { installed, problem } = Route.useSearch();
  const status = useQuery(installStatusQuery);
  const navigate = useNavigate();

  useEffect(() => {
    if (status.data?.member) navigate({ to: "/", replace: true });
  }, [status.data?.member, navigate]);

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[460px] place-items-center px-4 py-10">
      <Plate className="flex w-full flex-col gap-6 px-7 py-8">
        <Logo />
        {status.data && !status.data.member ? (
          <InstallBody status={status.data} installed={installed ?? false} problem={problem} />
        ) : (
          <div aria-hidden className="h-[188px] animate-pulse rounded-control bg-well" />
        )}
      </Plate>
    </main>
  );
}

function InstallBody({
  status,
  installed,
  problem,
}: {
  status: InstallStatus;
  installed: boolean;
  problem: Problem | undefined;
}) {
  if (problem === "enterprise" || status.enterprise) return <Enterprise />;
  if (installed && !status.signedIn) return <SignInAfterInstall />;

  return (
    <>
      <div>
        <h1 className="text-4xl tracking-title">
          {status.signedIn && status.teamName
            ? `Add Holler to ${status.teamName}`
            : "Add Holler to Slack"}
        </h1>
        <p className="mt-1.5 text-ink-2">
          {status.signedIn
            ? "Your workspace has not added Holler yet. Add it, and you can send your first Holler straight after."
            : "Holler asks your team something in Slack, reminds the people who have not answered, and shows you the results."}
        </p>
      </div>
      {problem && (
        <p
          role="alert"
          className={
            problem === "denied" || problem === "expired"
              ? "rounded-control bg-well px-4 py-3 text-ink-2 text-sm"
              : "rounded-control bg-danger px-4 py-3 text-danger-ink text-sm"
          }
        >
          {problemText[problem]}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <Button variant="primary" className="w-full" render={<a href="/slack/oauth/install" />}>
          Add to Slack
        </Button>
        <p className="text-muted text-sm">
          If your workspace needs an admin to approve apps, Slack sends them your request. Come back
          here once they approve it.
        </p>
      </div>
      <div className="border-divider border-t pt-5 text-sm">
        {status.signedIn ? <SignInAgain /> : <AlreadyAdded />}
      </div>
    </>
  );
}

function AlreadyAdded() {
  return (
    <p className="text-ink-2">
      Already added to your workspace?{" "}
      <Link to="/sign-in" className="text-primary underline underline-offset-2">
        Sign in with Slack
      </Link>
    </p>
  );
}

/** Someone signed in to the wrong Slack workspace signs out and picks another. */
function SignInAgain() {
  const [pending, setPending] = useState(false);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2">
      Signed in to the wrong workspace?
      <Button
        variant="ghost"
        size="sm"
        pending={pending}
        className="-ms-3"
        onClick={async () => {
          setPending(true);
          await authClient.signOut();
          window.location.assign("/sign-in");
        }}
      >
        Sign in again
      </Button>
    </p>
  );
}

/** Holler is in Slack now; Sign in with Slack starts by itself, and the button is the fallback. */
function SignInAfterInstall() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function signIn() {
    setPending(true);
    setError(null);
    const result = await authClient.signIn.social({ provider: "slack", callbackURL: "/" });
    if (result.error) {
      setPending(false);
      setError("Unable to start Sign in with Slack. Try the button again.");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void signIn();
  }, []);

  return (
    <>
      <div>
        <h1 className="text-4xl tracking-title">Holler is in Slack</h1>
        <p className="mt-1.5 text-ink-2">
          Sign in with the same Slack account to send your first Holler.
        </p>
      </div>
      <Button variant="primary" pending={pending} onClick={signIn} className="w-full">
        Sign in with Slack
      </Button>
      {error && (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}
    </>
  );
}

function Enterprise() {
  return (
    <>
      <div>
        <h1 className="text-4xl tracking-title">Enterprise Grid is not supported yet</h1>
        <p className="mt-1.5 text-ink-2">
          Holler works with standard Slack workspaces for now, so nothing was installed.
        </p>
      </div>
      <Button render={<Link to="/sign-in" />}>Back to sign in</Button>
    </>
  );
}
