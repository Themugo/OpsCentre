"use client";
// ─── Leads & Pipeline Page ────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatDate, formatKES, initials, cn } from "@/lib/utils";
import { Badge, PageSpinner, Modal, StatCard } from "@/components/ui";
import { Plus, Search } from "lucide-react";

type Stage = "new" | "qualified" | "proposal" | "won" | "lost";

const STAGES: Stage[] = ["new", "qualified", "proposal", "won", "lost"];

const STAGE_STYLE: Record<Stage, { label: string; color: string; border: string }> = {
  new:       { label: "New",       color: "bg-gray-50",   border: "border-gray-200" },
  qualified: { label: "Qualified", color: "bg-blue-50",   border: "border-blue-200" },
  proposal:  { label: "Proposal",  color: "bg-amber-50",  border: "border-amber-200" },
  won:       { label: "Won",       color: "bg-green-50",  border: "border-green-200" },
  lost:      { label: "Lost",      color: "bg-red-50",    border: "border-red-200" },
};

const STAGE_BADGE: Record<Stage, "gray"|"info"|"warning"|"success"|"danger"> = {
  new: "gray", qualified: "info", proposal: "warning", won: "success", lost: "danger",
};

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  stage: Stage;
  monthly_value_kes: number | null;
  area: string | null;
  created_at: string;
  service_plans: { name: string } | null;
  users: { name: string } | null;
}

export default function LeadsPage() {
  const supabase = createBrowserClient();
  const qc = useQueryClient();
  const [converting, setConverting] = useState<string | null>(null);
  const [view, setView]         = useState<"pipeline"|"list">("pipeline");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [search, setSearch]     = useState("");

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(`id, name, phone, email, source, stage, monthly_value_kes, area, created_at,
          service_plans(name),
          users!leads_assigned_to_fkey(name)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => {
      const { error } = await supabase.from("leads").update({ stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const filtered = leads?.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.phone.includes(search)
  ) ?? [];

  // KPIs
  const total    = leads?.length ?? 0;
  const pipeline = leads?.filter(l => !["won","lost"].includes(l.stage)) ?? [];
  const pipeVal  = pipeline.reduce((s, l) => s + (l.monthly_value_kes ?? 0), 0);
  const wonCount = leads?.filter(l => l.stage === "won").length ?? 0;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total leads"    value={total} />
        <StatCard label="In pipeline"    value={pipeline.length} change={formatKES(pipeVal)} changeUp />
        <StatCard label="Won"            value={wonCount} change={`${total ? Math.round(wonCount/total*100) : 0}% win rate`} changeUp />
        <StatCard label="Avg deal value" value={pipeline.length ? formatKES(Math.round(pipeVal / pipeline.length)) : "—"} />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8" placeholder="Search leads…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(["pipeline","list"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={cn("px-3 py-1.5 text-sm capitalize", view === v ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>
              {v}
            </button>
          ))}
        </div>
        <button className="btn-primary"><Plus size={14} /> Add lead</button>
      </div>

      {isLoading ? <PageSpinner /> : view === "pipeline" ? (
        // ── Kanban board ────────────────────────────────────────────────────
        <div className="grid grid-cols-5 gap-3 min-h-[400px]">
          {STAGES.map(stage => {
            const cards = filtered.filter(l => l.stage === stage);
            const stageVal = cards.reduce((s, l) => s + (l.monthly_value_kes ?? 0), 0);
            const s = STAGE_STYLE[stage];
            return (
              <div key={stage} className={cn("rounded-xl p-3", s.color, "border", s.border)}>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{s.label}</span>
                  <span className="text-xs bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-500">{cards.length}</span>
                </div>
                {stageVal > 0 && (
                  <div className="text-xs text-gray-500 mb-2">{formatKES(stageVal)}/mo</div>
                )}
                <div className="space-y-2">
                  {cards.map(lead => (
                    <div key={lead.id}
                      onClick={() => setSelected(lead)}
                      className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-brand-light flex items-center justify-center text-[10px] font-semibold text-brand-600 flex-shrink-0">
                          {initials(lead.name)}
                        </div>
                        <span className="text-xs font-medium text-gray-900 truncate">{lead.name}</span>
                      </div>
                      {lead.monthly_value_kes && (
                        <div className="text-sm font-semibold text-gray-900">{formatKES(lead.monthly_value_kes)}<span className="text-xs font-normal text-gray-400">/mo</span></div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-gray-400 capitalize">{lead.source}</span>
                        <span className="text-[10px] text-gray-400">{lead.area}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ── List view ───────────────────────────────────────────────────────
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Lead","Source","Plan interest","Area","Value","Stage"].map(h => (
                  <th key={h} className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr key={lead.id} onClick={() => setSelected(lead)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-light flex items-center justify-center text-xs font-semibold text-brand-600">{initials(lead.name)}</div>
                      <div>
                        <div className="font-medium text-gray-900">{lead.name}</div>
                        <div className="text-xs text-gray-400">{lead.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-gray-600 capitalize">{lead.source}</td>
                  <td className="py-3 px-3 text-gray-600">{lead.service_plans?.name ?? "—"}</td>
                  <td className="py-3 px-3 text-gray-500">{lead.area ?? "—"}</td>
                  <td className="py-3 px-3 font-medium">{lead.monthly_value_kes ? formatKES(lead.monthly_value_kes) : "—"}</td>
                  <td className="py-3 px-3"><Badge variant={STAGE_BADGE[lead.stage]}>{lead.stage}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lead detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ""}>
        {selected && (
          <div className="space-y-3">
            {[
              ["Phone",   selected.phone],
              ["Email",   selected.email ?? "—"],
              ["Source",  selected.source],
              ["Area",    selected.area ?? "—"],
              ["Value",   selected.monthly_value_kes ? formatKES(selected.monthly_value_kes) + "/mo" : "—"],
              ["Created", formatDate(selected.created_at)],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                <span className="text-gray-500">{l}</span>
                <span className="font-medium capitalize">{v}</span>
              </div>
            ))}
            <div>
              <label className="label mt-2">Move stage</label>
              <select className="input text-sm" defaultValue={selected.stage}
                onChange={e => updateStage.mutate({ id: selected.id, stage: e.target.value as Stage })}>
                {STAGES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
            {selected.stage === "won" && selected.converted_customer_id ? (
              <a href={`/dashboard/customers?highlight=${selected.converted_customer_id}`}
                className="btn-primary w-full justify-center mt-2 text-center block">
                View customer →
              </a>
            ) : (
              <button
                className="btn-primary w-full justify-center mt-2"
                disabled={converting === selected.id}
                onClick={async () => {
                  setConverting(selected.id);
                  try {
                    const planRes = await fetch("/api/onboarding/plans");
                    const { data: plans } = await planRes.json();
                    const firstPlan = plans?.[0];
                    if (!firstPlan) { alert("No active plans found"); return; }
                    const res = await fetch(`/api/leads/${selected.id}?action=convert`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ planId: firstPlan.id }),
                    });
                    const data = await res.json();
                    if (!res.ok) { alert(data.error ?? "Conversion failed"); return; }
                    qc.invalidateQueries({ queryKey: ["leads"] });
                    setSelected(null);
                    alert("Lead converted successfully! Customer account activated.");
                  } finally {
                    setConverting(null);
                  }
                }}>
                {converting === selected.id ? "Converting…" : "Convert to customer ↗"}
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
