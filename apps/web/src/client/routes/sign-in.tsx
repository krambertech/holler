import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Logo } from "@/components/logo";
import { Button, buttonClasses } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-in")({
  validateSearch: z.object({ next: z.string().optional().catch(undefined) }),
  component: SignIn,
});

/** Members sign in with Slack and nothing else. People answering never need to. */
function SignIn() {
  const { next } = Route.useSearch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only a path on this origin, so a crafted link cannot send someone elsewhere after sign-in.
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

  async function signIn() {
    setPending(true);
    setError(null);
    const result = await authClient.signIn.social({ provider: "slack", callbackURL: destination });
    if (result.error) {
      setPending(false);
      setError(
        "Slack sign-in is not set up here yet. Use a dev persona below, or try again later.",
      );
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[440px] place-items-center px-4">
      <Plate className="flex w-full flex-col gap-6 px-7 py-8">
        <Logo />
        <div>
          <h1 className="text-2xl tracking-title">Sign in to Holler</h1>
          <p className="mt-1.5 text-ink-2">
            Use your Slack account. Holler opens the workspace you sign in to.
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
        {import.meta.env.DEV && (
          <div className="flex flex-col gap-2 border-divider border-t pt-5">
            <span className="text-sm text-muted">Local development</span>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/dev/sign-in?as=lead&to=${encodeURIComponent(destination)}`}
                className={buttonClasses("secondary", "sm")}
              >
                Lead, with hollers
              </a>
              <a
                href={`/api/dev/sign-in?as=sender&to=${encodeURIComponent(destination)}`}
                className={buttonClasses("secondary", "sm")}
              >
                Sender, empty
              </a>
            </div>
          </div>
        )}
      </Plate>
    </main>
  );
}
