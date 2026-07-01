"use client";
// ─── Broadcasts Page ──────────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatDate, formatDateTime, timeAgo, cn } from "@/lib/utils";
import { Badge, PageSpinner, Modal, StatCard } from "@/components/ui";
import {
  Plus, Send, Eye, Users, MessageSquare,
  Mail, Clock, CheckCircle2, XCircle, BarChart2,
} from "lucide-react";

type Channel  = "sms" | "email" | "both";
type BStatus  = "draft" | "scheduled" | "sending" | "sent" | "failed" | "cancelled";

interface Broadcast {
  id:               string;
  title:            string;
  channel:          Channel;
  status:           BStatus;
  total_recipients: number;
  sent_count:       number;
  failed_count:     number;
  audience_filter:  Record<string, string>;
  scheduled_at:     string | null;
  completed_at:     string | null;
  created_at:       string;
  users:            { name: string } | null;
}

const STATUS_BADGE: Record<BStatus, "gray"|"info"|"warning"|"success"|"danger"> = {
  draft:     "gray",
  scheduled: "info",
  sending:   "warning",
  sent:      "success",
  failed:    "danger",
  cancelled: "gray",
};

const CHANNEL_ICON: Record<Channel, React.ReactNode> = {
  sms:   <MessageSquare size={13} />,
  email: <Mail size={13} />,
  both:  <><MessageSquare size={13} /><Mail size={13} /></>,
};

const AREAS = [
  "Westlands","Kilimani","Karen","Parklands","Kasarani",
  "Ruaka","Upper Hill","Lavington","Runda","Muthaiga",
];

const SMS_TEMPLATES = [
  { label: "Invoice reminder",  body: "Hi {{name}}, your OpsCentre invoice is due. Pay via M-Pesa Paybill 174379, Acc: your invoice number. Call 0800 000 000 for help." },
  { label: "Outage notice",     body: "Hi {{name}}, we are aware of a network issue in your area. Our team is working on it. We apologise for the inconvenience." },
  { label: "Maintenance alert", body: "Hi {{name}}, scheduled maintenance on {{date}}. Expect brief downtime. We apologise for any inconvenience." },
  { label: "Promo offer",       body: "Hi {{name}}, upgrade to a faster OpsCentre plan this month and get your first month at 50% off! Call 0800 000 000 to upgrade." },
  { label: "Welcome new area",  body: "Hi {{name}}, OpsCentre fiber internet is now available in your area! Sign up at portal.opscentre.io or call 0800 000 000." },
];

export default function BroadcastsPage() {
  const qc = useQueryClient();
  const [view,        setView]     = useState<"list"|"compose">("list");
  const [selected,    setSelected] = useState<Broadcast | null>(null);
  const [previewData, setPreview]  = useState<{ count: number; sample: any[] } | null>(null);
  const [previewing,  setPreviewing] = useState(false);
  const [sending,     setSending]  = useState(false);

  // Form state
  const [form, setForm] = useState({
    title:          "",
    channel:        "sms" as Channel,
    smsBody:        "",
    emailSubject:   "",
    emailHtml:      "",
    filter_status:  "active",
    filter_type:    "",
    filter_area:    "",
    filter_plan:    "",
    scheduledAt:    "",
  });

  const { data: broadcasts, isLoading } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: async () => {
      const res = await fetch("/api/broadcasts");
      const d   = await res.json();
      return d.data as Broadcast[];
    },
    refetchInterval: 8_000,  // poll while sending is in progress
  });

  const createBroadcast = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/broadcasts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:         form.title,
          channel:       form.channel,
          smsBody:       form.smsBody || undefined,
          emailSubject:  form.emailSubject || undefined,
          emailHtml:     form.emailHtml    || undefined,
          audienceFilter: {
            status:    form.filter_status  || undefined,
            type:      form.filter_type    || undefined,
            area:      form.filter_area    || undefined,
            plan_type: form.filter_plan    || undefined,
          },
          scheduledAt:   form.scheduledAt  || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
      setView("list");
      resetForm();
    },
  });

  async function handlePreview() {
    if (!form.title) return;
    setPreviewing(true);
    // Create draft first, then preview
    const res = await fetch("/api/broadcasts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:   form.title + " [preview]",
        channel: form.channel,
        smsBody: form.smsBody || "preview",
        audienceFilter: {
          status:    form.filter_status || undefined,
          type:      form.filter_type   || undefined,
          area:      form.filter_area   || undefined,
          plan_type: form.filter_plan   || undefined,
        },
      }),
    });
    const { data: draft } = await res.json();
    if (draft?.id) {
      const pRes = await fetch(`/api/broadcasts/${draft.id}?action=preview`, { method: "POST" });
      const pData = await pRes.json();
      setPreview(pData);
      // Delete the preview draft
      await fetch(`/api/broadcasts/${draft.id}`, { method: "DELETE" });
    }
    setPreviewing(false);
  }

  async function handleSend(broadcastId: string) {
    setSending(true);
    await fetch(`/api/broadcasts/${broadcastId}?action=send`, { method: "POST" });
    qc.invalidateQueries({ queryKey: ["broadcasts"] });
    setSending(false);
    setSelected(null);
  }

  function resetForm() {
    setForm({ title:"", channel:"sms", smsBody:"", emailSubject:"", emailHtml:"",
      filter_status:"active", filter_type:"", filter_area:"", filter_plan:"", scheduledAt:"" });
    setPreview(null);
  }

  const sentToday  = broadcasts?.filter(b => b.status === "sent" && b.completed_at &&
    new Date(b.completed_at).toDateString() === new Date().toDateString()).length ?? 0;
  const totalReach = broadcasts?.filter(b => b.status === "sent")
    .reduce((s, b) => s + b.sent_count, 0) ?? 0;
  const active     = broadcasts?.filter(b => b.status === "sending").length ?? 0;

  // ── Compose view ─────────────────────────────────────────────────────────
  if (view === "compose") {
    const smsLeft = 160 - form.smsBody.length;
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">New broadcast</h2>
          <button className="btn-secondary text-sm" onClick={() => { setView("list"); resetForm(); }}>
            Cancel
          </button>
        </div>

        {/* Step 1 — Basics */}
        <div className="card space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">1. Broadcast details</div>
          <div>
            <label className="label">Internal title</label>
            <input className="input" placeholder="e.g. April invoice reminder"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="label">Channel</label>
            <div className="flex gap-2">
              {(["sms","email","both"] as Channel[]).map(ch => (
                <button key={ch} onClick={() => setForm(f => ({ ...f, channel: ch }))}
                  className={cn("flex-1 py-2 rounded-lg border text-sm font-medium capitalize transition-colors",
                    form.channel === ch
                      ? "bg-brand-500 text-white border-brand-500"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50")}>
                  {ch === "both" ? "SMS + Email" : ch.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Step 2 — Content */}
        <div className="card space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">2. Message content</div>
          <p className="text-xs text-gray-400">Use <code className="bg-gray-100 px-1 rounded">{"{{name}}"}</code> to personalise with the customer's first name.</p>

          {["sms","both"].includes(form.channel) && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="label mb-0">SMS message</label>
                <span className={cn("text-xs", smsLeft < 20 ? "text-red-500" : "text-gray-400")}>
                  {smsLeft} chars left
                </span>
              </div>
              <textarea className="input min-h-[80px] resize-none"
                placeholder="Hi {{name}}, your invoice is due…"
                maxLength={160}
                value={form.smsBody}
                onChange={e => setForm(f => ({ ...f, smsBody: e.target.value }))} />
              <div className="flex gap-2 flex-wrap mt-1">
                {SMS_TEMPLATES.map(t => (
                  <button key={t.label} onClick={() => setForm(f => ({ ...f, smsBody: t.body }))}
                    className="text-xs text-brand-600 hover:underline">{t.label}</button>
                ))}
              </div>
            </div>
          )}

          {["email","both"].includes(form.channel) && (
            <>
              <div>
                <label className="label">Email subject</label>
                <input className="input" placeholder="Your April invoice from OpsCentre"
                  value={form.emailSubject}
                  onChange={e => setForm(f => ({ ...f, emailSubject: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email body (HTML)</label>
                <textarea className="input min-h-[120px] font-mono text-xs resize-y"
                  placeholder="<p>Hi {{name}},</p><p>Your invoice is ready…</p>"
                  value={form.emailHtml}
                  onChange={e => setForm(f => ({ ...f, emailHtml: e.target.value }))} />
              </div>
            </>
          )}
        </div>

        {/* Step 3 — Audience */}
        <div className="card space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">3. Audience filters</div>
          <p className="text-xs text-gray-400">Leave blank to send to all customers matching the channel.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.filter_status}
                onChange={e => setForm(f => ({ ...f, filter_status: e.target.value }))}>
                <option value="">All statuses</option>
                <option value="active">Active only</option>
                <option value="suspended">Suspended only</option>
              </select>
            </div>
            <div>
              <label className="label">Customer type</label>
              <select className="input" value={form.filter_type}
                onChange={e => setForm(f => ({ ...f, filter_type: e.target.value }))}>
                <option value="">All types</option>
                <option value="home">Home</option>
                <option value="business">Business</option>
                <option value="estate">Estate</option>
              </select>
            </div>
            <div>
              <label className="label">Area</label>
              <select className="input" value={form.filter_area}
                onChange={e => setForm(f => ({ ...f, filter_area: e.target.value }))}>
                <option value="">All areas</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Plan type</label>
              <select className="input" value={form.filter_plan}
                onChange={e => setForm(f => ({ ...f, filter_plan: e.target.value }))}>
                <option value="">All plans</option>
                <option value="home">Home plans</option>
                <option value="business">Business plans</option>
                <option value="estate">Estate plans</option>
              </select>
            </div>
          </div>

          {/* Audience preview */}
          <div className="flex items-center gap-3">
            <button className="btn-secondary text-sm flex items-center gap-2"
              onClick={handlePreview} disabled={previewing || !form.title}>
              <Eye size={14} />
              {previewing ? "Previewing…" : "Preview audience"}
            </button>
            {previewData && (
              <div className="flex items-center gap-1.5 text-sm">
                <Users size={14} className="text-brand-600" />
                <span className="font-semibold text-brand-600">{previewData.count.toLocaleString()}</span>
                <span className="text-gray-500">recipients</span>
              </div>
            )}
          </div>

          {previewData && previewData.sample.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
              <div className="font-medium text-gray-700 mb-2">Sample recipients:</div>
              {previewData.sample.slice(0, 5).map((r: any) => (
                <div key={r.customer_id} className="flex gap-3 py-0.5">
                  <span className="font-medium w-32 truncate">{r.name}</span>
                  <span className="text-gray-400">{r.phone ?? r.email}</span>
                  <span className="text-gray-400">{r.area}</span>
                </div>
              ))}
              {previewData.count > 5 && (
                <div className="text-gray-400 mt-1">…and {previewData.count - 5} more</div>
              )}
            </div>
          )}
        </div>

        {/* Step 4 — Schedule (optional) */}
        <div className="card space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">4. Schedule (optional)</div>
          <div>
            <label className="label">Send at (leave blank to save as draft)</label>
            <input type="datetime-local" className="input"
              value={form.scheduledAt}
              onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} />
          </div>
        </div>

        <div className="flex gap-3">
          <button className="btn-secondary flex-1 justify-center"
            onClick={() => createBroadcast.mutate()}
            disabled={!form.title || createBroadcast.isPending}>
            {createBroadcast.isPending ? "Saving…" : "Save as draft"}
          </button>
          <button
            className="btn-primary flex-1 justify-center flex items-center gap-2"
            onClick={() => {
              if (previewData && previewData.count > 0) {
                createBroadcast.mutate();
              }
            }}
            disabled={!previewData || previewData.count === 0 || createBroadcast.isPending}>
            <Send size={14} />
            {form.scheduledAt ? "Schedule broadcast" : "Send now"}
          </button>
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total broadcasts"  value={broadcasts?.length ?? 0} />
        <StatCard label="Sent today"        value={sentToday} />
        <StatCard label="Total reach"       value={totalReach.toLocaleString()} change="messages delivered" />
        <StatCard label="Currently sending" value={active} changeUp={active === 0} />
      </div>

      {/* Toolbar */}
      <div className="flex justify-end">
        <button className="btn-primary flex items-center gap-2" onClick={() => setView("compose")}>
          <Plus size={14} /> New broadcast
        </button>
      </div>

      {/* Broadcasts table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Title","Channel","Audience","Sent","Failed","Status","Created",""].map(h => (
                  <th key={h} className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(broadcasts ?? []).map(b => (
                <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelected(b)}>
                  <td className="py-3 px-3">
                    <div className="font-medium text-gray-900">{b.title}</div>
                    <div className="text-xs text-gray-400">by {(b.users as any)?.name ?? "—"}</div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1 text-gray-600 capitalize">
                      {CHANNEL_ICON[b.channel]} {b.channel}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1 text-gray-700">
                      <Users size={12} className="text-gray-400" />
                      {b.total_recipients.toLocaleString()}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-green-600 font-medium">{b.sent_count.toLocaleString()}</td>
                  <td className="py-3 px-3 text-red-500 font-medium">{b.failed_count.toLocaleString()}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <Badge variant={STATUS_BADGE[b.status]}>{b.status}</Badge>
                      {b.status === "sending" && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-xs text-gray-400">{timeAgo(b.created_at)}</td>
                  <td className="py-3 px-3">
                    {["draft","scheduled"].includes(b.status) && (
                      <button className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
                        onClick={e => { e.stopPropagation(); handleSend(b.id); }}
                        disabled={sending}>
                        <Send size={11} /> Send
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!broadcasts?.length && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                    No broadcasts yet — create your first one
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Broadcast detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)}
        title={selected?.title ?? ""} width="max-w-lg">
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex gap-2 flex-wrap">
              <Badge variant={STATUS_BADGE[selected.status]}>{selected.status}</Badge>
              <Badge variant="gray" className="capitalize">{selected.channel}</Badge>
            </div>

            {/* Progress bar if sending */}
            {selected.status === "sending" && selected.total_recipients > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Sending…</span>
                  <span>{selected.sent_count} / {selected.total_recipients}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all"
                    style={{ width: `${Math.round((selected.sent_count / selected.total_recipients) * 100)}%` }} />
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Recipients", value: selected.total_recipients.toLocaleString(), icon: <Users size={14} /> },
                { label: "Sent",       value: selected.sent_count.toLocaleString(),       icon: <CheckCircle2 size={14} className="text-green-500" /> },
                { label: "Failed",     value: selected.failed_count.toLocaleString(),     icon: <XCircle size={14} className="text-red-500" /> },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">{s.icon}</div>
                  <div className="text-lg font-bold text-gray-900">{s.value}</div>
                  <div className="text-xs text-gray-400">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Audience filters */}
            {Object.keys(selected.audience_filter).length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs font-semibold text-gray-500 mb-2">Audience filters</div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(selected.audience_filter).filter(([,v]) => v).map(([k, v]) => (
                    <span key={k} className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded-full text-gray-600 capitalize">
                      {k.replace("_"," ")}: {v as string}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="divide-y divide-gray-50">
              {[
                ["Created",   formatDate(selected.created_at)],
                ["Scheduled", selected.scheduled_at ? formatDateTime(selected.scheduled_at) : "—"],
                ["Completed", selected.completed_at ? formatDateTime(selected.completed_at) : "—"],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between py-2 text-sm">
                  <span className="text-gray-500">{l}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            {["draft","scheduled"].includes(selected.status) && (
              <button className="btn-primary w-full justify-center flex items-center gap-2"
                onClick={() => handleSend(selected.id)} disabled={sending}>
                <Send size={14} /> {sending ? "Sending…" : "Send now"}
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
