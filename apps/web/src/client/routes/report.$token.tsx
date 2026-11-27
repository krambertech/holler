import type { ReportOut } from "@holler/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { ReportView } from "@/components/results/report-view";
import { Skeleton } from "@/components/skeleton";
import { Plate } from "@/components/ui/plate";
import { api } from "@/lib/api";

export const Route = createFileRoute("/report/$token")({
  component: ReportPage,
});

function ReportPage() {
  const { token } = Route.useParams();
  const report = useQuery({
    queryKey: ["report", token],
    queryFn: () => api<ReportOut>(`/report/${encodeURIComponent(token)}`),
    retry: false,
  });
  if (report.isPending) {
    return (
      <main
        aria-busy
        aria-label="Loading the report"
        className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 pt-6 sm:px-10 lg:px-20"
      >
        <Logo />
        <Skeleton className="h-8 w-3/5 rounded-full" />
        <Skeleton className="h-24 w-full rounded-plate" />
      </main>
    );
  }
  if (report.isError) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-[720px] place-items-center px-4">
        <Plate className="flex w-full flex-col gap-5 px-6 py-8">
          <Logo />
          <div>
            <h1 className="text-4xl tracking-title">This report is not available</h1>
            <p className="mt-2 text-ink-2">{report.error.message}</p>
          </div>
        </Plate>
      </main>
    );
  }
  return <ReportView report={report.data} />;
}
