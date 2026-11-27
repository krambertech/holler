import type { ApiKeyCreatedOut, ApiKeyOut } from "@holler/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useId, useState } from "react";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Plate, PlateRow, PlateStrip } from "@/components/ui/plate";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { whenLabel } from "@/lib/format";
import { CopyButton, SettingsSection } from "./parts";
import { apiKeysQuery, createApiKey, DOCS_URL, revokeApiKey } from "./queries";

const scopeLabel = { read: "Read only", write: "Read and write" } as const;
const scopes = [
  { value: "read", label: scopeLabel.read },
  { value: "write", label: scopeLabel.write },
];

/** Settings → API keys: the member's own keys in this workspace, made and revoked here only. */
function ApiKeysSection() {
  const keys = useQuery(apiKeysQuery);
  const [created, setCreated] = useState<ApiKeyCreatedOut | null>(null);
  return (
    <SettingsSection
      id="settings-api-keys"
      title="API keys"
      description={
        <>
          A key lets a script use Holler as you, in this workspace.{" "}
          <a
            href={DOCS_URL}
            className="text-ink underline underline-offset-2 hoverable:hover:text-primary"
          >
            Read the API docs
          </a>
        </>
      }
    >
      {keys.isError ? (
        <ErrorState
          title="We could not load your API keys"
          onRetry={() => keys.refetch()}
          pending={keys.isRefetching}
        />
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
        <Skeleton aria-hidden className="h-[148px] rounded-plate" />
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
      <PlateRow role="group" className="flex flex-col gap-3 px-5 py-4" aria-labelledby={id}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-normal">{created.name}</span>
          <Chip variant={created.scope === "write" ? "tint" : "quiet"}>
            {scopeLabel[created.scope]}
          </Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-sm bg-well px-3 py-2 font-mono text-ink text-sm">
            {created.key}
          </code>
          <CopyButton text={created.key} aria-label={`Copy the key ${created.name}`} />
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
              <span className="truncate font-normal">{apiKey.name}</span>
              <Chip variant={apiKey.scope === "write" ? "tint" : "quiet"}>
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
      <form onSubmit={submit} className="flex flex-col gap-3 px-5 py-4" noValidate>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Field className="min-w-0 flex-1">
            <FieldLabel>Name</FieldLabel>
            <Input
              value={name}
              maxLength={60}
              onChange={(event) => {
                setName(event.target.value);
                setMissingName(false);
              }}
              placeholder="Weekly pulse script"
            />
            <FieldError>{error}</FieldError>
          </Field>
          <Field className="sm:w-48">
            <FieldLabel>Access</FieldLabel>
            <Select
              value={scope}
              onValueChange={(next) => setScope(next as "read" | "write")}
              items={scopes}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent />
            </Select>
          </Field>
          <Button type="submit" pending={create.isPending} className="sm:mt-[26px]">
            Make key
          </Button>
        </div>
        <p className="text-muted text-sm">
          {scope === "write"
            ? "Can also create, edit, send and close hollers, and send reminders."
            : "Can list hollers and read their results. Cannot change or send anything."}
        </p>
      </form>
    </PlateRow>
  );
}

export { ApiKeysSection };
