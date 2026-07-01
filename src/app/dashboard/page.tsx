// ─── Dashboard Home Page ──────────────────────────────────────────────────────
// Server component — fetches KPIs directly from Supabase.

import { createServerComponentClient } from "@/lib/supabase";
import { formatKES, formatDate, invoiceStatusClass, jobStatusClass } from "@/lib/utils";
import { Badge, StatCard } from "@/components/ui";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  // ── Parallel data fetches ──────────────────────────────────────────────────
  const [
    { count: totalCustomers },
    { data: revenueData },
    { data: pendingInvoices },
    { data: recentJobs },
    { data: networkNodes },
    { data: openTickets },
  ] = await Promise.all([
    supabase.from("customers").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("payments").select("amount_kes").gte("paid_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    supabase.from("invoices").select("id, invoice_no, amount_kes, status, due_date, customers(name)").in("status", ["pending", "overdue"]).order("due_date").limit(5),
    supabase.from("field_jobs").select("id, type, status, scheduled_at, customers(name), addresses(area)").order("scheduled_at", { ascending: false }).limit(5),
    supabase.from("network_nodes").select("id, name, status").order("status"),
    supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "open"),
  ]);

  const monthlyRevenue = revenueData?.reduce((s, r) => s + (r.amount_kes ?? 0), 0) ?? 0;
  const downNodes = networkNodes?.filter((n) => n.status === "down").length ?? 0;

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active subscribers"  value={totalCustomers?.toLocaleString() ?? "—"} change="+132 this month" changeUp />
        <StatCard label="Revenue (this month)" value={formatKES(monthlyRevenue)} change="+8.4% vs last month" changeUp />
        <StatCard label="Pending invoices"     value={pendingInvoices?.length ?? 0} change={`${pendingInvoices?.filter(i=>i.status==="overdue").length ?? 0} overdue`} changeUp={false} />
        <StatCard label="Open tickets"         value={openTickets ?? 0} change={downNodes > 0 ? `${downNodes} nodes down` : "All nodes online"} changeUp={downNodes === 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent invoices */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Pending invoices</h2>
            <a href="/dashboard/invoices" className="text-xs text-brand-600 hover:underline">View all</a>
          </div>
          <div className="space-y-0">
            {pendingInvoices?.map((inv) => (
              <div key={inv.id} className="table-row">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{(inv.customers as any)?.name}</div>
                  <div className="text-xs text-gray-400">{inv.invoice_no} · Due {formatDate(inv.due_date)}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-medium">{formatKES(inv.amount_kes)}</span>
                  <Badge variant={inv.status === "overdue" ? "danger" : "warning"}>
                    {inv.status}
                  </Badge>
                </div>
              </div>
            ))}
            {!pendingInvoices?.length && (
              <p className="text-sm text-gray-400 py-4 text-center">All invoices paid 🎉</p>
            )}
          </div>
        </div>

        {/* Recent field jobs */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Field jobs</h2>
            <a href="/dashboard/field-jobs" className="text-xs text-brand-600 hover:underline">View all</a>
          </div>
          <div className="space-y-0">
            {recentJobs?.map((job) => (
              <div key={job.id} className="table-row">
                <div>
                  <div className="font-medium text-gray-900 text-sm capitalize">{job.type.replace("_", " ")} — {(job.addresses as any)?.area}</div>
                  <div className="text-xs text-gray-400">{(job.customers as any)?.name} · {formatDate(job.scheduled_at)}</div>
                </div>
                <Badge variant={
                  job.status === "done" ? "success" :
                  job.status === "in_progress" ? "info" :
                  job.status === "en_route" ? "warning" : "gray"
                }>
                  {job.status.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Network nodes summary */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Network status</h2>
          <a href="/dashboard/network" className="text-xs text-brand-600 hover:underline">View monitor</a>
        </div>
        <div className="flex flex-wrap gap-2">
          {networkNodes?.map((node) => (
            <div key={node.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
              <span className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                node.status === "online" ? "bg-green-500" :
                node.status === "degraded" ? "bg-amber-500" : "bg-red-500"
              )} />
              <span className="text-xs text-gray-700">{node.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Needed for cn in server component
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
