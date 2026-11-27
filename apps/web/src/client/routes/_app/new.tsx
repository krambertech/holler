import { hollerTemplates, modes } from "@holler/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import { blankDraft, draftFromHoller, draftFromTemplate } from "@/components/editor/draft";
import { HollerEditor } from "@/components/editor/holler-editor";
import {
  BackArrow,
  backLinkClassName,
  HollerEditorTop,
} from "@/components/editor/holler-editor-top";
import { apiIo } from "@/components/editor/io";
import { StartScreen } from "@/components/editor/start-screen";
import { TemplatesDialog } from "@/components/editor/templates-dialog";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/skeleton";
import { directoryLookupQuery, hollerQuery, meQuery, workspaceSettingsQuery } from "@/lib/queries";

const searchSchema = z.object({
  mode: z.enum(modes).optional(),
  template: z.string().optional(),
  draft: z.string().optional(),
});

export const Route = createFileRoute("/_app/new")({
  validateSearch: searchSchema,
  component: NewHoller,
});

function BackLink() {
  return (
    <Link to="/" aria-label="Your hollers" className={backLinkClassName}>
      <BackArrow />
    </Link>
  );
}

function NewHoller() {
  const { mode, template, draft } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const fromTemplate = template ? hollerTemplates.find((t) => t.id === template) : undefined;
  const startedHere = useRef(false);
  const fresh = Boolean(mode || fromTemplate);
  if (fresh && !draft) startedHere.current = true;

  if (draft && !startedHere.current) return <SavedDraft id={draft} />;

  if (!fresh) {
    return (
      <>
        <div className="flex flex-col gap-3">
          <HollerEditorTop
            back={<BackLink />}
            heading={<span className="px-2 text-ink">New holler</span>}
            saveState="idle"
          />
          <StartScreen
            onPickMode={(next) => navigate({ search: { mode: next } })}
            onPickTemplate={(id) => navigate({ search: { template: id } })}
            onSeeAllTemplates={() => setTemplatesOpen(true)}
          />
        </div>
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
    />
  );
}

function SavedDraft({ id }: { id: string }) {
  const holler = useQuery(hollerQuery(id));
  const [ids, setIds] = useState<string[] | null>(null);
  if (holler.data && ids === null) {
    const { audience, announceChannelId } = holler.data;
    setIds([
      ...audience.people,
      ...audience.groups,
      ...(announceChannelId ? [announceChannelId] : []),
    ]);
  }
  const known = useQuery({ ...directoryLookupQuery(ids ?? []), enabled: ids !== null });
  const opened = useRef(false);
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
  if (!opened.current && (!holler.data || known.isPending)) return <EditorSkeleton />;
  opened.current = true;
  if (!holler.data) return <EditorSkeleton />;
  return (
    <Editor
      key={id}
      initial={draftFromHoller(holler.data)}
      saved={holler.data}
      known={known.data}
    />
  );
}

function Editor({
  initial,
  saved,
  known,
}: {
  initial: ReturnType<typeof blankDraft>;
  saved?: Parameters<typeof HollerEditor>[0]["saved"];
  known?: Parameters<typeof HollerEditor>[0]["known"];
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
      sender={me.data?.member.name ?? "You"}
      timeZone={me.data?.member.timeZone}
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
