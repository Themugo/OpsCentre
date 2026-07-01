"use client";
// ─── Portal Support Tickets Page ─────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatDate, timeAgo } from "@/lib/utils";
import { Badge, PageSpinner } from "@/components/ui";
import { CheckCircle } from "lucide-react";

export default function PortalTicketsPage() {
  const supabase = createBrowserClient();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"open"|"new">("open");
  const [form, setForm] = useState({ category: "technical", subject: "", description: "" });
  const [submitted, setSubmitted] = useState(false);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => supabase.auth.getSession().then(r => r.data.session),
  });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["portal-tickets"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, ticket_no, category, priority, status, subject, description, sla_due_at, created_at, resolved_at")
        .eq("customer_id", session!.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createTicket = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId:  session!.user.id,
          category:    form.category,
          subject:     form.subject,
          description: form.description,
        }),
      });
      if (!res.ok) throw new Error("Failed to create ticket");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-tickets"] });
      setSubmitted(true);
      setForm({ category: "technical", subject: "", description: "" });
      setTimeout(() => { setSubmitted(false); setTab("open"); }, 3000);
    },
  });

  const STATUS_BADGE: Record<string, "danger"|"warning"|"success"|"gray"> = {
    open: "danger", in_progress: "warning", resolved: "success", closed: "gray",
  };

  const open     = tickets?.filter(t => !["resolved","closed"].includes(t.status)) ?? [];
  const resolved = tickets?.filter(t =>  ["resolved","closed"].includes(t.status)) ?? [];

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: "open",  label: `Open tickets (${open.length})` },
          { key: "new",   label: "Raise new ticket" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${tab === t.key ? "border-gray-900 text-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "open" ? (
        <div className="space-y-3">
          {isLoading ? <PageSpinner /> : (
            <>
              {/* Active tickets */}
              {open.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Active</div>
                  {open.map((t: any) => (
                    <div key={t.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{t.subject}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{t.ticket_no} · {t.category} · {timeAgo(t.created_at)}</div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <Badge variant="gray">{t.priority}</Badge>
                          <Badge variant={STATUS_BADGE[t.status]}>{t.status.replace("_"," ")}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Resolved */}
              {resolved.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-500">Resolved</div>
                  {resolved.slice(0, 5).map((t: any) => (
                    <div key={t.id} className="px-4 py-3 border-b border-gray-50 last:border-0 opacity-70">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <div className="text-sm text-gray-700">{t.subject}</div>
                          <div className="text-xs text-gray-400">{t.ticket_no} · resolved {t.resolved_at ? timeAgo(t.resolved_at) : ""}</div>
                        </div>
                        <Badge variant="success">resolved</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {open.length === 0 && resolved.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">No tickets yet</div>
              )}
            </>
          )}
        </div>
      ) : (
        /* New ticket form */
        <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-lg">
          {submitted ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle size={40} className="text-green-500 mx-auto" />
              <p className="text-base font-semibold text-gray-900">Ticket submitted!</p>
              <p className="text-sm text-gray-500">Our team will respond within 24 hours.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="label">Category</label>
                <select className="input" value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="technical">Technical issue</option>
                  <option value="billing">Billing query</option>
                  <option value="general">General enquiry</option>
                </select>
              </div>
              <div>
                <label className="label">Subject</label>
                <input className="input" placeholder="Briefly describe the issue"
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input min-h-[100px] resize-y"
                  placeholder="Tell us more — when did it start? What have you already tried?"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <button
                className="btn-primary w-full justify-center"
                disabled={!form.subject || createTicket.isPending}
                onClick={() => createTicket.mutate()}>
                {createTicket.isPending ? "Submitting…" : "Submit ticket"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
