"use client";
// ─── Invoices Page ────────────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatKES, formatDate } from "@/lib/utils";
import { Badge, Table, PageSpinner, Modal, StatCard } from "@/components/ui";
import { Search, Plus, RefreshCw } from "lucide-react";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "pending";

interface Invoice {
  id: string;
  invoice_no: string;
  amount_kes: number;
  status: InvoiceStatus;
  due_date: string;
  paid_at: string | null;
  created_at: string;
  customers: { name: string; phone: string } | null;
  subscriptions: { service_plans: { name: string } | null } | null;
}

export default function InvoicesPage() {
  const supabase = createBrowserClient();
  const qc = useQueryClient();

  const [search, setSearch]   = useState("");
  const [status, setStatus]   = useState<InvoiceStatus | "all">("all");
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [payPhone, setPayPhone]   = useState("");
  const [payState, setPayState]   = useState<"idle" | "sending" | "pending" | "done" | "failed">("idle");
  const [payMsg, setPayMsg]       = useState("");

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices", status],
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select(`id, invoice_no, amount_kes, status, due_date, paid_at, created_at,
          customers(name, phone),
          subscriptions(service_plans(name))`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data as Invoice[];
    },
  });

  const filtered = invoices?.filter((i) =>
    i.invoice_no.toLowerCase().includes(search.toLowerCase()) ||
    (i.customers as any)?.name?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  // Stats
  const total     = invoices?.reduce((s, i) => s + i.amount_kes, 0) ?? 0;
  const collected = invoices?.filter(i => i.status === "paid").reduce((s, i) => s + i.amount_kes, 0) ?? 0;
  const overdue   = invoices?.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount_kes, 0) ?? 0;

  // Pay mutation
  async function handlePay() {
    if (!payTarget || !payPhone) return;
    setPayState("sending");
    try {
      const res = await fetch("/api/mpesa/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: payTarget.id,
          invoiceNumber: payTarget.invoice_no,
          phone: payPhone,
          amountKes: payTarget.amount_kes,
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
          qc.invalidateQueries({ queryKey: ["invoices"] });
        } else if (d.status === "failed" || attempts > 30) {
          clearInterval(poll);
          setPayState("failed");
          setPayMsg(d.message ?? "Payment failed");
        }
      }, 3000);
    } catch (e) {
      setPayState("failed");
      setPayMsg("Network error");
    }
  }

  const columns = [
    {
      key: "invoice_no",
      header: "Invoice",
      render: (i: Invoice) => (
        <div>
          <div className="font-medium text-gray-900 font-mono text-xs">{i.invoice_no}</div>
          <div className="text-xs text-gray-400">{(i.subscriptions as any)?.service_plans?.name ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (i: Invoice) => <span className="text-sm">{(i.customers as any)?.name ?? "—"}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      render: (i: Invoice) => <span className="font-medium text-sm">{formatKES(i.amount_kes)}</span>,
    },
    {
      key: "due",
      header: "Due date",
      render: (i: Invoice) => <span className="text-xs text-gray-500">{formatDate(i.due_date)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (i: Invoice) => (
        <Badge variant={i.status === "paid" ? "success" : i.status === "overdue" ? "danger" : i.status === "pending" || i.status === "sent" ? "warning" : "gray"}>
          {i.status}
        </Badge>
      ),
    },
    {
      key: "action",
      header: "",
      render: (i: Invoice) =>
        ["pending", "sent", "overdue"].includes(i.status) ? (
          <button
            className="btn-primary text-xs py-1 px-2"
            onClick={(e) => { e.stopPropagation(); setPayTarget(i); setPayPhone((i.customers as any)?.phone ?? ""); setPayState("idle"); }}
          >
            Pay via M-Pesa
          </button>
        ) : i.status === "paid" ? (
          <span className="text-xs text-gray-400">Paid {i.paid_at ? formatDate(i.paid_at) : ""}</span>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total billed" value={formatKES(total)} />
        <StatCard label="Collected" value={formatKES(collected)} change={`${total ? Math.round(collected / total * 100) : 0}% rate`} changeUp />
        <StatCard label="Overdue" value={formatKES(overdue)} change={`${invoices?.filter(i=>i.status==="overdue").length ?? 0} invoices`} changeUp={false} />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8" placeholder="Search invoices…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto text-sm" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
          <option value="draft">Draft</option>
        </select>
        <button className="btn-primary"><Plus size={14} /> New invoice</button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? <PageSpinner /> : <Table columns={columns} data={filtered} emptyMessage="No invoices found" />}
      </div>

      {/* M-Pesa payment modal */}
      <Modal open={!!payTarget} onClose={() => { setPayTarget(null); setPayState("idle"); }} title="M-Pesa Payment">
        {payTarget && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{formatKES(payTarget.amount_kes)}</div>
              <div className="text-sm text-gray-500 mt-1">{payTarget.invoice_no} · {(payTarget.customers as any)?.name}</div>
            </div>

            {payState === "idle" && (
              <>
                <div>
                  <label className="label">Customer M-Pesa phone</label>
                  <input className="input" placeholder="0712 345 678" value={payPhone} onChange={(e) => setPayPhone(e.target.value)} />
                </div>
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={() => setPayTarget(null)}>Cancel</button>
                  <button className="btn-primary flex-1 justify-center" onClick={handlePay}>Send M-Pesa prompt</button>
                </div>
              </>
            )}
            {payState === "sending" && <div className="text-center py-4 text-sm text-gray-500">Sending STK push…</div>}
            {payState === "pending" && (
              <div className="text-center py-4">
                <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-sm text-gray-600">{payMsg}</p>
                <p className="text-xs text-gray-400 mt-1">Waiting for customer to enter PIN…</p>
              </div>
            )}
            {payState === "done" && (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl mx-auto mb-3">✓</div>
                <p className="text-sm font-medium">Payment received!</p>
                <button className="btn-primary mt-4 w-full justify-center" onClick={() => setPayTarget(null)}>Done</button>
              </div>
            )}
            {payState === "failed" && (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xl mx-auto mb-3">✕</div>
                <p className="text-sm text-gray-600">{payMsg}</p>
                <div className="flex gap-3 mt-4">
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
