// ─── Portal Overview Page ─────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase";
import { formatKES, formatDate, invoiceStatusClass } from "@/lib/utils";
import Link from "next/link";

export default async function PortalOverviewPage() {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const customerId = session.user.id;

  const [
    { data: customer },
    { data: pendingInvoices },
    { data: openTickets },
    { data: latestMetric },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select(`
        id, name, status,
        subscriptions(
          id, status, next_billing_date, static_ip,
          service_plans(name, speed_down_mbps, speed_up_mbps, price_kes)
        )
      `)
      .eq("id", customerId)
      .single(),

    supabase
      .from("invoices")
      .select("id, invoice_no, amount_kes, status, due_date, subscription_id")
      .eq("subscriptions.customer_id", customerId)
      .in("status", ["pending", "sent", "overdue"])
      .order("due_date")
      .limit(1),

    supabase
      .from("support_tickets")
      .select("id, ticket_no, subject, status, priority")
      .eq("customer_id", customerId)
      .not("status", "in", '("resolved","closed")')
      .limit(3),

    supabase
      .from("latest_node_metrics")
      .select("throughput_mbps, latency_ms, packet_loss_pct, node_status")
      .limit(1)
      .single(),
  ]);

  const activeSub = customer?.subscriptions?.find((s: any) => s.status === "active");
  const plan      = activeSub?.service_plans as any;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Status cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Current plan</div>
          <div className="text-base font-semibold text-gray-900">{plan?.name ?? "—"}</div>
          <div className="text-xs text-brand-600 mt-1">{plan ? `${plan.speed_down_mbps}↓ / ${plan.speed_up_mbps}↑ Mbps` : ""}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Next billing</div>
          <div className="text-base font-semibold text-gray-900">
            {activeSub?.next_billing_date ? formatDate(activeSub.next_billing_date) : "—"}
          </div>
          <div className="text-xs text-gray-400 mt-1">{plan ? formatKES(plan.price_kes) : ""}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Account status</div>
          <div className={`text-base font-semibold ${customer?.status === "active" ? "text-green-600" : "text-red-500"}`}>
            {customer?.status ?? "—"}
          </div>
          <div className="text-xs text-gray-400 mt-1">Member since</div>
        </div>
      </div>

      {/* Connection snapshot */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Connection</h2>
          <Link href="/portal/connection" className="text-xs text-brand-600 hover:underline">Details →</Link>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: "Download", value: latestMetric?.throughput_mbps ? `${latestMetric.throughput_mbps} Mbps` : "—" },
            { label: "Latency",  value: latestMetric?.latency_ms      ? `${latestMetric.latency_ms}ms` : "—" },
            { label: "Status",   value: latestMetric?.node_status ?? "Unknown" },
          ].map(s => (
            <div key={s.label}>
              <div className="text-xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending invoice */}
      {(pendingInvoices?.length ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm font-semibold text-amber-900">Invoice due</div>
              <div className="text-xs text-amber-700 mt-0.5">
                {pendingInvoices![0].invoice_no} · {formatKES(pendingInvoices![0].amount_kes)} · Due {formatDate(pendingInvoices![0].due_date)}
              </div>
            </div>
            <Link href="/portal/invoices" className="btn-primary text-xs px-3 py-1.5">Pay now</Link>
          </div>
        </div>
      )}

      {/* Open tickets */}
      {(openTickets?.length ?? 0) > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Open tickets</h2>
            <Link href="/portal/tickets" className="text-xs text-brand-600 hover:underline">View all →</Link>
          </div>
          {openTickets!.map((t: any) => (
            <div key={t.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
              <div>
                <div className="font-medium text-gray-900">{t.subject}</div>
                <div className="text-xs text-gray-400">{t.ticket_no}</div>
              </div>
              <span className={`badge-${t.status === "open" ? "danger" : "warning"} text-xs`}>
                {t.status.replace("_"," ")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/portal/tickets" className="bg-white border border-gray-200 rounded-xl p-4 hover:border-brand-300 transition-colors">
          <div className="text-sm font-semibold text-gray-900">Raise a ticket</div>
          <div className="text-xs text-gray-400 mt-1">Report an issue or ask a question</div>
        </Link>
        <Link href="/portal/upgrade" className="bg-white border border-gray-200 rounded-xl p-4 hover:border-brand-300 transition-colors">
          <div className="text-sm font-semibold text-gray-900">Upgrade plan</div>
          <div className="text-xs text-gray-400 mt-1">Get faster speeds from {plan ? formatKES(plan.price_kes) : ""}</div>
        </Link>
      </div>
    </div>
  );
}
