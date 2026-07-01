"use client";
// ─── Field Jobs Page ──────────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatDate, formatDateTime, jobStatusClass, initials } from "@/lib/utils";
import { Badge, Table, PageSpinner, Modal, StatCard } from "@/components/ui";
import { Search, Plus } from "lucide-react";

type JobStatus = "scheduled" | "en_route" | "in_progress" | "done" | "cancelled";
type JobType   = "installation" | "repair" | "survey" | "upgrade";

interface FieldJob {
  id: string;
  type: JobType;
  status: JobStatus;
  scheduled_at: string;
  completed_at: string | null;
  notes: string | null;
  customers: { name: string; phone: string } | null;
  addresses: { area: string; street: string } | null;
  users: { name: string } | null;
}

const STATUS_BADGE: Record<JobStatus, "gray" | "warning" | "info" | "success" | "danger"> = {
  scheduled:   "gray",
  en_route:    "warning",
  in_progress: "info",
  done:        "success",
  cancelled:   "danger",
};

export default function FieldJobsPage() {
  const supabase = createBrowserClient();
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState<JobStatus | "all">("all");
  const [selected, setSelected]   = useState<FieldJob | null>(null);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["field-jobs", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("field_jobs")
        .select(`id, type, status, scheduled_at, completed_at, notes,
          customers(name, phone),
          addresses(area, street),
          users(name)`)
        .order("scheduled_at", { ascending: false })
        .limit(100);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as FieldJob[];
    },
  });

  const filtered = jobs?.filter((j) =>
    (j.customers as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
    (j.addresses as any)?.area?.toLowerCase().includes(search.toLowerCase()) ||
    j.type.includes(search.toLowerCase())
  ) ?? [];

  const columns = [
    {
      key: "type",
      header: "Job type",
      render: (j: FieldJob) => (
        <div>
          <div className="font-medium text-gray-900 capitalize">{j.type.replace("_", " ")}</div>
          <div className="text-xs text-gray-400">{(j.addresses as any)?.area}</div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (j: FieldJob) => <span className="text-sm">{(j.customers as any)?.name ?? "—"}</span>,
    },
    {
      key: "technician",
      header: "Technician",
      render: (j: FieldJob) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-brand-light flex items-center justify-center text-[10px] font-semibold text-brand-600">
            {initials((j.users as any)?.name ?? "?")}
          </div>
          <span className="text-sm text-gray-700">{(j.users as any)?.name ?? "Unassigned"}</span>
        </div>
      ),
    },
    {
      key: "scheduled",
      header: "Scheduled",
      render: (j: FieldJob) => <span className="text-xs text-gray-500">{formatDateTime(j.scheduled_at)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (j: FieldJob) => (
        <Badge variant={STATUS_BADGE[j.status]}>
          {j.status.replace("_", " ")}
        </Badge>
      ),
    },
  ];

  const todayJobs  = jobs?.filter(j => new Date(j.scheduled_at).toDateString() === new Date().toDateString()) ?? [];
  const doneToday  = todayJobs.filter(j => j.status === "done").length;
  const activeJobs = jobs?.filter(j => j.status === "in_progress").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Today's jobs"    value={todayJobs.length} />
        <StatCard label="Completed today" value={doneToday} change={`${todayJobs.length ? Math.round(doneToday/todayJobs.length*100) : 0}%`} changeUp />
        <StatCard label="In progress"     value={activeJobs} />
        <StatCard label="Scheduled"       value={jobs?.filter(j=>j.status==="scheduled").length ?? 0} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8" placeholder="Search jobs…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto text-sm" value={statusFilter} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="all">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="en_route">En route</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="btn-primary"><Plus size={14} /> Assign job</button>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <Table columns={columns} data={filtered} onRowClick={setSelected} emptyMessage="No field jobs found" />
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`${selected?.type?.replace("_"," ")} — ${(selected?.addresses as any)?.area}`}>
        {selected && (
          <div className="space-y-3 text-sm">
            {[
              ["Customer",   (selected.customers as any)?.name],
              ["Phone",      (selected.customers as any)?.phone],
              ["Address",    (selected.addresses as any)?.street],
              ["Area",       (selected.addresses as any)?.area],
              ["Technician", (selected.users as any)?.name ?? "Unassigned"],
              ["Scheduled",  formatDateTime(selected.scheduled_at)],
              ["Completed",  selected.completed_at ? formatDateTime(selected.completed_at) : "—"],
              ["Status",     selected.status.replace("_", " ")],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-500">{l}</span>
                <span className="font-medium capitalize">{v}</span>
              </div>
            ))}
            {selected.notes && (
              <div className="bg-gray-50 rounded-lg p-3 mt-2">
                <div className="text-xs text-gray-500 mb-1">Notes</div>
                <p className="text-sm text-gray-700">{selected.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
