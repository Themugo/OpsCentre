"use client";
// ─── Field App — Jobs List ────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatDate, cn } from "@/lib/utils";
import { Badge, PageSpinner } from "@/components/ui";
import Link from "next/link";
import { AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react";

interface Job {
  id: string;
  type: string;
  status: string;
  priority: string;
  scheduled_at: string;
  completed_at: string | null;
  notes: string | null;
  customers: { name: string; phone: string } | null;
  addresses: { area: string; street: string } | null;
}

const STATUS_BADGE: Record<string, "gray"|"warning"|"info"|"success"|"danger"> = {
  scheduled: "gray", en_route: "warning", in_progress: "info", done: "success", cancelled: "danger",
};

const SECTION_ORDER = ["in_progress", "en_route", "scheduled", "done", "cancelled"];

export default function FieldJobsPage() {
  const supabase = createBrowserClient();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => supabase.auth.getSession().then(r => r.data.session),
  });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["field-jobs-today"],
    enabled: !!session,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("field_jobs")
        .select(`id, type, status, priority, scheduled_at, completed_at, notes,
          customers(name, phone), addresses(area, street)`)
        .eq("technician_id", session!.user.id)
        .gte("scheduled_at", new Date().toISOString().slice(0, 10) + "T00:00:00")
        .lte("scheduled_at", new Date().toISOString().slice(0, 10) + "T23:59:59")
        .order("scheduled_at");
      if (error) throw error;
      return data as Job[];
    },
  });

  const today     = new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" });
  const doneCount = jobs?.filter(j => j.status === "done").length ?? 0;
  const total     = jobs?.length ?? 0;

  if (isLoading) return (
    <div className="flex flex-col">
      <FieldHeader today={today} done={0} total={0} />
      <PageSpinner />
    </div>
  );

  // Group by status
  const grouped: Record<string, Job[]> = {};
  for (const status of SECTION_ORDER) {
    const group = jobs?.filter(j => j.status === status) ?? [];
    if (group.length) grouped[status] = group;
  }

  return (
    <div className="flex flex-col">
      <FieldHeader today={today} done={doneCount} total={total} />

      <div className="px-4 py-3 space-y-5">
        {Object.keys(grouped).length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">No jobs scheduled for today</div>
        )}

        {SECTION_ORDER.filter(s => grouped[s]).map(status => (
          <div key={status}>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              {status.replace("_", " ")}
            </div>
            <div className="space-y-3">
              {grouped[status].map(job => (
                <Link key={job.id} href={`/field/jobs/${job.id}`}
                  className={cn(
                    "block bg-white rounded-xl border p-4 active:scale-[0.98] transition-transform",
                    job.priority === "critical" ? "border-l-4 border-l-red-500 border-gray-200" :
                    status === "in_progress"    ? "border-l-4 border-l-brand-500 border-gray-200" :
                    "border-gray-200"
                  )}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {job.priority === "critical" && <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />}
                        <span className="font-semibold text-gray-900 capitalize">{job.type.replace("_"," ")}</span>
                      </div>
                      <div className="text-sm text-gray-600 mt-0.5 truncate">
                        {(job.customers as any)?.name}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {(job.addresses as any)?.area} · {new Date(job.scheduled_at).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={STATUS_BADGE[job.status]}>{job.status.replace("_"," ")}</Badge>
                      {job.status !== "done" && (
                        <ChevronRight size={16} className="text-gray-300" />
                      )}
                      {job.status === "done" && (
                        <CheckCircle2 size={16} className="text-green-500" />
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldHeader({ today, done, total }: { today: string; done: number; total: number }) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-4">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-base font-semibold text-gray-900">My jobs</div>
          <div className="text-xs text-gray-400 mt-0.5">{today}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-gray-900">{done}<span className="text-gray-300 font-normal">/{total}</span></div>
          <div className="text-xs text-gray-400">completed</div>
        </div>
      </div>
      {total > 0 && (
        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full transition-all"
            style={{ width: `${total ? Math.round((done/total)*100) : 0}%` }} />
        </div>
      )}
    </div>
  );
}
