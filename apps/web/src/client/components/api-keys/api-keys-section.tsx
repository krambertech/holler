import type { ApiKeyCreatedOut, ApiKeyOut } from "@holler/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { type FormEvent, useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Plate, PlateRow, PlateStrip } from "@/components/ui/plate";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { CopyButton, DOCS_URL, SettingsSection, whenLabel } from "./parts";
import { apiKeysQuery, createApiKey, revokeApiKey } from "./queries";

const scopeLabel = { read: "Read only", write: "Read and write" } as const;

/** Settings → API keys: the member's own keys in this workspace, made and revoked here only. */
export function ApiKeysSection() {
  const keys = useQuery(apiKeysQuery);
  const [created, setCreated] = useState<ApiKeyCreatedOut | null>(null);
  return (
    <SettingsSection
      id="settings-api-keys"
      title="API keys"
      description={
        <>
          A key lets a script use Holler as you, in this workspace.{" "}
          <a href={DOCS_URL} className="text-ink underline underline-offset-2 hover:text-primary">
            Read the API docs
          </a>
        </>
      }
    >
      {keys.isError ? (
        <Plate className="px-5 py-4 text-danger-ink">
          Unable to load your API keys. Refresh the page to try again.
        </Plate>
      ) : keys.data ? (
        <Plate>
          {created && <NewKey created={created} onDone={() => setCreated(null)} />}
          {keys.data.length === 0 && !created && (
            <PlateRow className="px-5 py-4 text-ink-2">
              You have no API keys. Name one below to make it.
            </PlateRow>
          )}
          {keys.data
            .filter((key) => key.id !== created?.id)
            .map((key) => (
              <KeyRow key={key.id} apiKey={key} />
            ))}
          <NewKeyForm onCreated={setCreated} />
        </Plate>
      ) : (
        <Plate aria-hidden className="h-[148px] animate-pulse" />
      )}
    </SettingsSection>
  );
}

/** The key itself, once. Holler keeps only a hash. */
function NewKey({ created, onDone }: { created: ApiKeyCreatedOut; onDone: () => void }) {
  const id = useId();
  return (
    <>
      <PlateStrip id={id}>
        <span>Copy this key now. Holler cannot show it again.</span>
      </PlateStrip>
      <PlateRow className="flex flex-col gap-3 px-5 py-4" aria-labelledby={id}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-normal text-md">{created.name}</span>
          <Chip tone={created.scope === "write" ? "tint" : "quiet"}>
            {scopeLabel[created.scope]}
          </Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-sm bg-well px-3 py-2 font-mono text-ink text-sm">
            {created.key}
          </code>
          <CopyButton text={created.key} label={`Copy the key ${created.name}`} />
          <Button size="sm" variant="ghost" onClick={onDone}>
            Done
          </Button>
        </div>
      </PlateRow>
    </>
  );
}

function KeyRow({ apiKey }: { apiKey: ApiKeyOut }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  // The button that opened the confirm is gone, so focus lands on Cancel, the safe choice.
  const focusCancel = useCallback(
    (row: HTMLDivElement | null) => row?.querySelector("button")?.focus(),
    [],
  );
  const revoke = useMutation({
    mutationFn: () => revokeApiKey(apiKey.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeysQuery.queryKey }),
  });
  const errorId = `key-error-${apiKey.id}`;
  return (
    <PlateRow className="flex flex-col gap-2 px-5 py-3.5">
      {confirming ? (
        <div ref={focusCancel} className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1">
            Revoke {apiKey.name}? Scripts that use it stop working at once.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              pending={revoke.isPending}
              onClick={() => revoke.mutate()}
              aria-describedby={revoke.isError ? errorId : undefined}
            >
              Revoke key
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate font-normal text-md">{apiKey.name}</span>
              <Chip tone={apiKey.scope === "write" ? "tint" : "quiet"}>
                {scopeLabel[apiKey.scope]}
              </Chip>
            </span>
            <span className="text-muted text-sm">
              {[
                apiKey.start ? `${apiKey.start}…` : null,
                `Made ${whenLabel(apiKey.createdAt)}`,
                apiKey.lastUsedAt ? `Last used ${whenLabel(apiKey.lastUsedAt)}` : "Never used",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => setConfirming(true)}
            aria-label={`Revoke ${apiKey.name}`}
          >
            Revoke
          </Button>
        </div>
      )}
      {revoke.isError && (
        <p id={errorId} role="alert" className="text-danger-ink text-sm">
          {revoke.error instanceof ApiError
            ? revoke.error.message
            : "Unable to revoke the key. Check your connection and try again."}
        </p>
      )}
    </PlateRow>
  );
}

function NewKeyForm({ onCreated }: { onCreated: (key: ApiKeyCreatedOut) => void }) {
  const queryClient = useQueryClient();
  const nameId = useId();
  const scopeId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const create = useMutation({
    mutationFn: () => createApiKey({ name: name.trim(), scope }),
    onSuccess: async (key) => {
      setName("");
      setScope("read");
      onCreated(key);
      await queryClient.invalidateQueries({ queryKey: apiKeysQuery.queryKey });
    },
  });
  const [missingName, setMissingName] = useState(false);
  const error = missingName
    ? "Name the key, so you can tell it apart later."
    : create.isError
      ? create.error instanceof ApiError
        ? create.error.message
        : "Unable to make the key. Check your connection and try again."
      : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setMissingName(true);
      return;
    }
    setMissingName(false);
    create.mutate();
  }

  return (
    <PlateRow>
      <form onSubmit={submit} className="flex flex-col gap-2 px-5 py-4" noValidate>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label htmlFor={nameId} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-muted text-sm">Name</span>
            <input
              id={nameId}
              value={name}
              maxLength={60}
              onChange={(event) => {
                setName(event.target.value);
                setMissingName(false);
              }}
              placeholder="Weekly pulse script"
              aria-invalid={missingName || undefined}
              aria-describedby={error ? errorId : undefined}
              className={cn(
                "h-10 rounded-control bg-plate px-3 text-ink shadow-[0_0_0_1px_var(--edge-2)] placeholder:text-muted",
                missingName && "shadow-[0_0_0_1px_var(--danger-dot)]",
              )}
            />
          </label>
          <label htmlFor={scopeId} className="flex flex-col gap-1.5">
            <span className="text-muted text-sm">Access</span>
            <span className="relative inline-flex">
              <select
                id={scopeId}
                value={scope}
                onChange={(event) => setScope(event.target.value as "read" | "write")}
                className="h-10 w-full appearance-none rounded-control bg-plate ps-3 pe-9 text-ink shadow-[0_0_0_1px_var(--edge-2)] hover:bg-well sm:w-auto"
              >
                <option value="read">Read only</option>
                <option value="write">Read and write</option>
              </select>
              <ChevronDown
                aria-hidden
                size={16}
                strokeWidth={2}
                className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted"
              />
            </span>
          </label>
          <Button type="submit" pending={create.isPending}>
            Make key
          </Button>
        </div>
        <p className="text-muted text-sm">
          {scope === "write"
            ? "Can also create, edit, send and close hollers, and send reminders."
            : "Can list hollers and read their results. Cannot change or send anything."}
        </p>
        {error && (
          <p id={errorId} role="alert" className="text-danger-ink text-sm">
            {error}
          </p>
        )}
      </form>
    </PlateRow>
  );
}
