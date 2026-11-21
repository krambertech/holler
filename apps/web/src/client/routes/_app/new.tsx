import { hollerTemplates, modes } from "@holler/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import { blankDraft, draftFromHoller, draftFromTemplate } from "@/components/editor/draft";
import { BackLabel, HollerEditor } from "@/components/editor/holler-editor";
import { apiIo } from "@/components/editor/io";
import { StartScreen } from "@/components/editor/start-screen";
import { TemplatesDialog } from "@/components/editor/templates-dialog";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/skeleton";
import { directoryLookupQuery, hollerQuery, meQuery, workspaceSettingsQuery } from "@/lib/queries";

const searchSchema = z.object({
  mode: z.enum(modes).optional(),
  template: z.string().optional(),
  /** The saved draft, once the first save made one. */
  draft: z.string().optional(),
  stage: z.enum(["compose", "send"]).optional(),
});

/**
 * New holler: the start screen, then the editor. One route holds both a new Holler and a saved
 * draft (`?draft=<id>`), so the first save changes the address without remounting the editor.
 */
export const Route = createFileRoute("/_app/new")({
  validateSearch: searchSchema,
  component: NewHoller,
});

function BackLink() {
  return (
    <Link
      to="/"
      className="relative inline-flex w-fit items-center gap-1.5 rounded-sm py-1 text-ink-2 hoverable:hover:text-ink pointer-coarse:before:absolute pointer-coarse:before:-inset-2 pointer-coarse:before:content-['']"
    >
      <BackLabel />
    </Link>
  );
}

function NewHoller() {
  const { mode, template, draft, stage = "compose" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const fromTemplate = template ? hollerTemplates.find((t) => t.id === template) : undefined;
  // Started here from a mode or a template: the editor already holds the draft, so a save that
  // adds `draft` to the address must not load it again.
  const startedHere = useRef(false);
  const fresh = Boolean(mode || fromTemplate);
  if (fresh && !draft) startedHere.current = true;

  if (draft && !startedHere.current) return <SavedDraft id={draft} stage={stage} />;

  if (!fresh) {
    return (
      <>
        <BackLink />
        <StartScreen
          onPickMode={(next) => navigate({ search: { mode: next } })}
          onPickTemplate={(id) => navigate({ search: { template: id } })}
          onSeeAllTemplates={() => setTemplatesOpen(true)}
        />
        <TemplatesDialog
          open={templatesOpen}
          onOpenChange={setTemplatesOpen}
          onUse={(t) => navigate({ search: { template: t.id } })}
        />
      </>
    );
  }

  return (
    <Editor
      key={template ?? mode}
      initial={fromTemplate ? draftFromTemplate(fromTemplate) : blankDraft(mode ?? "survey")}
      stage={stage}
    />
  );
}

function SavedDraft({ id, stage }: { id: string; stage: "compose" | "send" }) {
  const holler = useQuery(hollerQuery(id));
  const audience = holler.data?.audience;
  const ids = audience ? [...audience.people, ...audience.groups] : [];
  const known = useQuery({
    ...directoryLookupQuery(
      holler.data?.announceChannelId ? [...ids, holler.data.announceChannelId] : ids,
    ),
    enabled: Boolean(holler.data),
  });
  if (holler.isError) {
    return (
      <>
        <BackLink />
        <ErrorState
          title="We could not open this draft"
          description={holler.error.message}
          onRetry={() => holler.refetch()}
          pending={holler.isRefetching}
        />
      </>
    );
  }
  if (!holler.data || known.isPending) return <EditorSkeleton />;
  return (
    <Editor
      key={id}
      initial={draftFromHoller(holler.data)}
      saved={holler.data}
      known={known.data}
      stage={stage}
    />
  );
}

function Editor({
  initial,
  saved,
  known,
  stage,
}: {
  initial: ReturnType<typeof blankDraft>;
  saved?: Parameters<typeof HollerEditor>[0]["saved"];
  known?: Parameters<typeof HollerEditor>[0]["known"];
  stage: "compose" | "send";
}) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const io = useMemo(() => apiIo(queryClient), [queryClient]);
  const me = useQuery(meQuery);
  const workspace = useQuery(workspaceSettingsQuery);
  return (
    <HollerEditor
      io={io}
      initial={initial}
      saved={saved}
      known={known}
      stage={stage}
      onStageChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, stage: next }), replace: true })
      }
      sender={me.data?.member.name ?? "You"}
      workspaceSize={workspace.data?.people ?? null}
      onCreated={(holler) =>
        navigate({ search: (prev) => ({ ...prev, draft: holler.id }), replace: true })
      }
      onSent={(holler) => navigate({ to: "/hollers/$id", params: { id: holler.id } })}
      onDeleted={() => navigate({ to: "/" })}
      backLink={<BackLink />}
    />
  );
}

/** The editor's shape while a draft loads. */
function EditorSkeleton() {
  return (
    <section aria-busy aria-label="Opening your draft" className="flex flex-col gap-7">
      <Skeleton className="h-4 w-28 rounded-full" />
      <Skeleton className="h-9 w-64 rounded-full" />
      <Skeleton className="h-9 w-48 rounded-full" />
      {[0, 1].map((i) => (
        <div key={i} className="grid gap-3 rounded-plate bg-plate p-5 edge">
          <Skeleton className="h-5 w-2/5 rounded-full" />
          <Skeleton className="h-10 w-full rounded-control" />
          <Skeleton className="h-10 w-full rounded-control" />
        </div>
      ))}
    </section>
  );
}
