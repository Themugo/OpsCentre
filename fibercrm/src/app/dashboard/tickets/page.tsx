"use client";
// ─── Support Tickets Page ─────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatDate, timeAgo, initials, cn } from "@/lib/utils";
import { Badge, Table, PageSpinner, Modal, StatCard } from "@/components/ui";
import { Search, Plus, AlertTriangle } from "lucide-react";

interface Ticket {
  id: string;
  ticket_no: string;
  category: "billing" | "technical" | "general";
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  subject: string;
  sla_breached: boolean;
  sla_due_at: string;
  created_at: string;
  resolved_at: string | null;
  customers: { id: string; name: string; phone: string } | null;
  users: { name: string } | null;
}

const PRIORITY_BADGE: Record<string, "danger"|"warning"|"info"|"gray"> = {
  critical: "danger", high: "warning", medium: "info", low: "gray",
};
const STATUS_BADGE: Record<string, "danger"|"warning"|"success"|"gray"> = {
  open: "danger", in_progress: "warning", resolved: "success", closed: "gray",
};

export default function TicketsPage() {
  const supabase = createBrowserClient();
  const qc = useQueryClient();

  const [statusFilter, setStatus]   = useState("all");
  const [priorityFilter, setPriority] = useState("all");
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<Ticket | null>(null);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["tickets", statusFilter, priorityFilter],
    queryFn: async () => {
      let q = supabase
        .from("support_tickets")
        .select(`id, ticket_no, category, priority, status, subject,
          sla_breached, sla_due_at, created_at, resolved_at,
          customers(id, name, phone),
          users!support_tickets_assigned_to_fkey(name)`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (statusFilter !== "all")   q = q.eq("status", statusFilter);
      if (priorityFilter !== "all") q = q.eq("priority", priorityFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as Ticket[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      setSelected(null);
    },
  });

  const filtered = tickets?.filter(t =>
    t.subject.toLowerCase().includes(search.toLowerCase()) ||
    (t.customers as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.ticket_no.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const open      = tickets?.filter(t => t.status === "open").length ?? 0;
  const breached  = tickets?.filter(t => t.sla_breached).length ?? 0;
  const resolved  = tickets?.filter(t => t.status === "resolved").length ?? 0;
  const critical  = tickets?.filter(t => t.priority === "critical" && t.status !== "resolved" && t.status !== "closed").length ?? 0;

  const columns = [
    {
      key: "ticket",
      header: "Ticket",
      render: (t: Ticket) => (
        <div className="flex items-center gap-2">
          {t.sla_breached && <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />}
          <div>
            <div className="font-medium text-gray-900 text-sm">{t.subject}</div>
            <div className="text-xs text-gray-400">{t.ticket_no} · {timeAgo(t.created_at)}</div>
          </div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (t: Ticket) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-brand-light flex items-center justify-center text-[10px] font-semibold text-brand-600">
            {initials((t.customers as any)?.name ?? "?")}
          </div>
          <span className="text-sm text-gray-700">{(t.customers as any)?.name ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (t: Ticket) => <Badge variant="gray">{t.category}</Badge>,
    },
    {
      key: "priority",
      header: "Priority",
      render: (t: Ticket) => <Badge variant={PRIORITY_BADGE[t.priority]}>{t.priority}</Badge>,
    },
    {
      key: "assigned",
      header: "Assigned to",
      render: (t: Ticket) => (
        <span className="text-sm text-gray-600">{(t.users as any)?.name ?? "Unassigned"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (t: Ticket) => <Badge variant={STATUS_BADGE[t.status]}>{t.status.replace("_", " ")}</Badge>,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Open tickets"   value={open}     change={`${critical} critical`} changeUp={critical === 0} />
        <StatCard label="SLA breached"   value={breached}  changeUp={breached === 0} change={breached > 0 ? "Needs attention" : "All on time"} />
        <StatCard label="Resolved"       value={resolved}  changeUp />
        <StatCard label="Avg resolution" value="4.2h"      changeUp />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8" placeholder="Search tickets…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto text-sm" value={statusFilter} onChange={e => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select className="input w-auto text-sm" value={priorityFilter} onChange={e => setPriority(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button className="btn-primary"><Plus size={14} /> New ticket</button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <Table columns={columns} data={filtered} onRowClick={setSelected} emptyMessage="No tickets found" />
        )}
      </div>

      {/* Ticket detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.ticket_no ?? ""}>
        {selected && (
          <div className="space-y-3 text-sm">
            <div className="font-medium text-gray-900">{selected.subject}</div>
            <div className="flex gap-2 flex-wrap">
              <Badge variant={PRIORITY_BADGE[selected.priority]}>{selected.priority}</Badge>
              <Badge variant={STATUS_BADGE[selected.status]}>{selected.status.replace("_"," ")}</Badge>
              <Badge variant="gray">{selected.category}</Badge>
              {selected.sla_breached && <Badge variant="danger">SLA breached</Badge>}
            </div>
            {[
              ["Customer",   (selected.customers as any)?.name],
              ["Phone",      (selected.customers as any)?.phone],
              ["Assigned to",(selected.users as any)?.name ?? "Unassigned"],
              ["Opened",     formatDate(selected.created_at)],
              ["SLA due",    formatDate(selected.sla_due_at)],
              ["Resolved",   selected.resolved_at ? formatDate(selected.resolved_at) : "—"],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-500">{l}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
            <div className="flex gap-2 pt-2 flex-wrap">
              {selected.status === "open" && (
                <button className="btn-secondary flex-1"
                  onClick={() => updateStatus.mutate({ id: selected.id, status: "in_progress" })}>
                  Start working
                </button>
              )}
              {["open","in_progress"].includes(selected.status) && (
                <button className="btn-primary flex-1 justify-center"
                  onClick={() => updateStatus.mutate({ id: selected.id, status: "resolved" })}>
                  Mark resolved
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
