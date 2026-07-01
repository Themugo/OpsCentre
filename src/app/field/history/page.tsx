// ─── Field App — History Page ─────────────────────────────────────────────────
"use client";

import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import { Badge, PageSpinner } from "@/components/ui";

export default function FieldHistoryPage() {
  const supabase = createBrowserClient();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => supabase.auth.getSession().then(r => r.data.session),
  });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["field-history"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("field_jobs")
        .select(`id, type, status, scheduled_at, completed_at,
          customers(name), addresses(area)`)
        .eq("technician_id", session!.user.id)
        .eq("status", "done")
        .order("completed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const thisWeek  = jobs?.filter(j => {
    const d = new Date(j.completed_at ?? j.scheduled_at);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    return d >= weekAgo;
  }).length ?? 0;

  return (
    <div>
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="text-base font-semibold text-gray-900">Job history</div>
        <div className="text-xs text-gray-400 mt-0.5">{thisWeek} jobs completed this week</div>
      </div>

      {isLoading ? <PageSpinner /> : (
        <div className="px-4 py-4 space-y-3">
          {(jobs ?? []).map((job: any) => (
            <div key={job.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-gray-900 capitalize">{job.type.replace("_"," ")}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{job.customers?.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{job.addresses?.area} · {formatDate(job.completed_at ?? job.scheduled_at)}</div>
                </div>
                <Badge variant="success">Done</Badge>
              </div>
            </div>
          ))}
          {!jobs?.length && (
            <div className="text-center py-16 text-gray-400 text-sm">No completed jobs yet</div>
          )}
        </div>
      )}
    </div>
  );
}
