"use client";
// ─── Portal Invoices Page ─────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatKES, formatDate } from "@/lib/utils";
import { Badge, PageSpinner, Modal } from "@/components/ui";
import { Download, CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function PortalInvoicesPage() {
  const supabase = createBrowserClient();
  const [payTarget, setPayTarget] = useState<any>(null);
  const [phone, setPhone]         = useState("");
  const [payState, setPayState]   = useState<"idle"|"sending"|"pending"|"done"|"failed">("idle");
  const [payMsg, setPayMsg]       = useState("");
  const [receipt, setReceipt]     = useState("");

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => supabase.auth.getSession().then(r => r.data.session),
  });

  const { data: invoices, isLoading, refetch } = useQuery({
    queryKey: ["portal-invoices"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          id, invoice_no, amount_kes, status,
          due_date, paid_at, created_at,
          billing_period_start, billing_period_end,
          subscriptions!inner(
            customer_id,
            service_plans(name)
          )
        `)
        .eq("subscriptions.customer_id", session!.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function handlePay() {
    if (!payTarget || !phone) return;
    setPayState("sending");
    try {
      const res = await fetch("/api/mpesa/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId:     payTarget.id,
          invoiceNumber: payTarget.invoice_no,
          phone,
          amountKes:     payTarget.amount_kes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setPayState("failed"); setPayMsg(data.error); return; }

      setPayState("pending");
      setPayMsg(data.message);

      // Poll every 4s for up to 90s
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const r = await fetch("/api/mpesa/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutRequestId: data.checkoutRequestId }),
        });
        const d = await r.json();
        if (d.status === "success") {
          clearInterval(poll);
          setPayState("done");
          setReceipt(d.receipt ?? "");
          refetch();
        } else if (d.status === "failed" || attempts > 22) {
          clearInterval(poll);
          setPayState("failed");
          setPayMsg(d.message ?? "Payment failed or timed out");
        }
      }, 4000);
    } catch {
      setPayState("failed");
      setPayMsg("Network error");
    }
  }

  const totalDue  = invoices?.filter(i => ["pending","sent","overdue"].includes(i.status))
                             .reduce((s: number, i: any) => s + i.amount_kes, 0) ?? 0;
  const totalPaid = invoices?.filter(i => i.status === "paid")
                             .reduce((s: number, i: any) => s + i.amount_kes, 0) ?? 0;

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-xs text-amber-700 mb-1">Outstanding</div>
          <div className="text-2xl font-bold text-amber-900">{formatKES(totalDue)}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-xs text-green-700 mb-1">Total paid (2026)</div>
          <div className="text-2xl font-bold text-green-900">{formatKES(totalPaid)}</div>
        </div>
      </div>

      {isLoading ? <PageSpinner /> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Invoice history</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {(invoices ?? []).map((inv: any) => {
              const isPending = ["pending","sent","overdue"].includes(inv.status);
              return (
                <div key={inv.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900">{inv.invoice_no}</div>
                    <div className="text-xs text-gray-400">
                      {(inv.subscriptions as any)?.service_plans?.name} ·{" "}
                      {inv.billing_period_start ? formatDate(inv.billing_period_start) : formatDate(inv.created_at)}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {isPending ? `Due ${formatDate(inv.due_date)}` : `Paid ${formatDate(inv.paid_at)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold text-gray-900">{formatKES(inv.amount_kes)}</span>
                    <Badge variant={inv.status === "paid" ? "success" : inv.status === "overdue" ? "danger" : "warning"}>
                      {inv.status}
                    </Badge>
                    {isPending ? (
                      <button className="btn-primary text-xs px-3 py-1.5"
                        onClick={() => { setPayTarget(inv); setPayState("idle"); setPhone(""); }}>
                        Pay
                      </button>
                    ) : (
                      <button className="btn-secondary text-xs px-2 py-1.5 flex items-center gap-1">
                        <Download size={11} /> PDF
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* M-Pesa modal */}
      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title="Pay via M-Pesa" width="max-w-sm">
        {payTarget && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">{formatKES(payTarget.amount_kes)}</div>
              <div className="text-sm text-gray-400 mt-1">{payTarget.invoice_no}</div>
            </div>

            {payState === "idle" && (
              <>
                <div>
                  <label className="label">Your M-Pesa phone number</label>
                  <input className="input" placeholder="0712 345 678"
                    value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2 text-xs text-gray-500">
                  {[
                    "You'll receive a pop-up on your phone",
                    "Enter your M-Pesa PIN to confirm",
                    "Payment confirmed automatically",
                  ].map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-semibold flex-shrink-0 mt-0.5">{i+1}</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={() => setPayTarget(null)}>Cancel</button>
                  <button className="btn-primary flex-1 justify-center" onClick={handlePay} disabled={!phone}>
                    Send M-Pesa prompt
                  </button>
                </div>
              </>
            )}

            {payState === "sending" && (
              <div className="text-center py-4 text-sm text-gray-500 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Sending request…
              </div>
            )}

            {payState === "pending" && (
              <div className="text-center py-6 space-y-3">
                <Loader2 size={32} className="animate-spin text-brand-500 mx-auto" />
                <p className="text-sm text-gray-700 font-medium">{payMsg}</p>
                <p className="text-xs text-gray-400">Waiting for PIN confirmation…</p>
              </div>
            )}

            {payState === "done" && (
              <div className="text-center py-6 space-y-3">
                <CheckCircle size={40} className="text-green-500 mx-auto" />
                <p className="text-base font-semibold">Payment received!</p>
                {receipt && <p className="text-xs text-gray-500">Receipt: <span className="font-mono font-medium">{receipt}</span></p>}
                <button className="btn-primary w-full justify-center" onClick={() => setPayTarget(null)}>Done</button>
              </div>
            )}

            {payState === "failed" && (
              <div className="text-center py-6 space-y-3">
                <XCircle size={40} className="text-red-500 mx-auto" />
                <p className="text-sm text-gray-600">{payMsg}</p>
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={() => setPayTarget(null)}>Close</button>
                  <button className="btn-primary flex-1 justify-center" onClick={() => setPayState("idle")}>Try again</button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
