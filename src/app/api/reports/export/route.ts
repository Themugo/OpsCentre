// ─── GET /api/reports/export ──────────────────────────────────────────────────
// Exports reports as CSV or PDF.
// Supported reports: revenue, invoices, customers, subscriptions, field_jobs, tickets
//
// Query params:
//   type     — report type (required)
//   format   — csv | pdf (default: csv)
//   from     — start date YYYY-MM-DD (optional)
//   to       — end date YYYY-MM-DD (optional)
//   status   — filter by status (optional)

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";

type ReportType = "revenue" | "invoices" | "customers" | "subscriptions" | "field_jobs" | "tickets" | "payments";
type Format     = "csv" | "pdf";

// ── CSV builder ───────────────────────────────────────────────────────────────
function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape  = (v: unknown) => {
    const s = String(v ?? "").replace(/"/g, '""');
    return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape(r[h])).join(",")),
  ].join("\n");
}

// ── Report fetchers ───────────────────────────────────────────────────────────
async function fetchRevenue(sb: any, from?: string, to?: string) {
  let q = sb
    .from("payments")
    .select(`
      id, amount_kes, method, mpesa_ref, stripe_ref, paid_at,
      invoices(invoice_no, subscriptions(customers(name, phone), service_plans(name)))
    `)
    .order("paid_at", { ascending: false });
  if (from) q = q.gte("paid_at", from);
  if (to)   q = q.lte("paid_at", to + "T23:59:59");
  const { data } = await q;
  return (data ?? []).map((p: any) => ({
    Date:           p.paid_at?.slice(0,10),
    Customer:       p.invoices?.subscriptions?.customers?.name ?? "—",
    Phone:          p.invoices?.subscriptions?.customers?.phone ?? "—",
    Plan:           p.invoices?.subscriptions?.service_plans?.name ?? "—",
    Invoice:        p.invoices?.invoice_no ?? "—",
    Amount_KES:     p.amount_kes,
    Method:         p.method,
    Receipt:        p.mpesa_ref ?? p.stripe_ref ?? "—",
  }));
}

async function fetchInvoices(sb: any, from?: string, to?: string, status?: string) {
  let q = sb
    .from("invoices")
    .select(`
      id, invoice_no, amount_kes, status, due_date, paid_at, created_at,
      subscriptions(customers(name, phone, email), service_plans(name, type))
    `)
    .order("created_at", { ascending: false });
  if (from)   q = q.gte("created_at", from);
  if (to)     q = q.lte("created_at", to + "T23:59:59");
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []).map((i: any) => ({
    Invoice_No:  i.invoice_no,
    Customer:    i.subscriptions?.customers?.name    ?? "—",
    Email:       i.subscriptions?.customers?.email   ?? "—",
    Phone:       i.subscriptions?.customers?.phone   ?? "—",
    Plan:        i.subscriptions?.service_plans?.name ?? "—",
    Plan_Type:   i.subscriptions?.service_plans?.type ?? "—",
    Amount_KES:  i.amount_kes,
    Status:      i.status,
    Due_Date:    i.due_date,
    Paid_At:     i.paid_at?.slice(0,10) ?? "—",
    Created_At:  i.created_at?.slice(0,10),
  }));
}

async function fetchCustomers(sb: any, status?: string) {
  let q = sb
    .from("customers")
    .select(`
      id, name, email, phone, type, status, created_at,
      addresses(area, county),
      subscriptions(service_plans(name, price_kes), status, start_date)
    `)
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data } = await q;
  const activeSub = (subs: any[]) => subs?.find((s: any) => s.status === "active");
  return (data ?? []).map((c: any) => {
    const sub = activeSub(c.subscriptions ?? []);
    return {
      Name:         c.name,
      Email:        c.email ?? "—",
      Phone:        c.phone,
      Type:         c.type,
      Status:       c.status,
      Area:         c.addresses?.area   ?? "—",
      County:       c.addresses?.county ?? "—",
      Plan:         sub?.service_plans?.name     ?? "No active plan",
      Monthly_KES:  sub?.service_plans?.price_kes ?? 0,
      Active_Since: sub?.start_date ?? "—",
      Customer_Since: c.created_at?.slice(0,10),
    };
  });
}

async function fetchFieldJobs(sb: any, from?: string, to?: string, status?: string) {
  let q = sb
    .from("field_jobs")
    .select(`
      id, type, status, priority, scheduled_at, completed_at,
      customers(name, phone),
      addresses(area, street),
      users!field_jobs_technician_id_fkey(name)
    `)
    .order("scheduled_at", { ascending: false });
  if (from)   q = q.gte("scheduled_at", from);
  if (to)     q = q.lte("scheduled_at", to + "T23:59:59");
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []).map((j: any) => ({
    Type:        j.type,
    Status:      j.status,
    Priority:    j.priority,
    Customer:    j.customers?.name ?? "—",
    Phone:       j.customers?.phone ?? "—",
    Area:        j.addresses?.area ?? "—",
    Address:     j.addresses?.street ?? "—",
    Technician:  j.users?.name ?? "Unassigned",
    Scheduled:   j.scheduled_at?.slice(0,16)?.replace("T"," "),
    Completed:   j.completed_at?.slice(0,16)?.replace("T"," ") ?? "—",
  }));
}

async function fetchTickets(sb: any, from?: string, to?: string, status?: string) {
  let q = sb
    .from("support_tickets")
    .select(`
      ticket_no, category, priority, status, subject,
      sla_breached, created_at, resolved_at,
      customers(name, phone),
      users!support_tickets_assigned_to_fkey(name)
    `)
    .order("created_at", { ascending: false });
  if (from)   q = q.gte("created_at", from);
  if (to)     q = q.lte("created_at", to + "T23:59:59");
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []).map((t: any) => ({
    Ticket_No:   t.ticket_no,
    Subject:     t.subject,
    Category:    t.category,
    Priority:    t.priority,
    Status:      t.status,
    SLA_Breached: t.sla_breached ? "Yes" : "No",
    Customer:    t.customers?.name ?? "—",
    Phone:       t.customers?.phone ?? "—",
    Assigned_To: t.users?.name ?? "Unassigned",
    Created_At:  t.created_at?.slice(0,10),
    Resolved_At: t.resolved_at?.slice(0,10) ?? "—",
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (!user || !["admin","billing"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp     = req.nextUrl.searchParams;
  const type   = sp.get("type")   as ReportType | null;
  const format = (sp.get("format") ?? "csv") as Format;
  const from   = sp.get("from")   ?? undefined;
  const to     = sp.get("to")     ?? undefined;
  const status = sp.get("status") ?? undefined;

  if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });

  const sb = createServiceClient();
  let rows: Record<string, unknown>[] = [];
  let filename = `fibercrm_${type}_${new Date().toISOString().slice(0,10)}`;

  switch (type) {
    case "revenue":
    case "payments":
      rows     = await fetchRevenue(sb, from, to);
      filename = `fibercrm_revenue_${new Date().toISOString().slice(0,10)}`;
      break;
    case "invoices":
      rows = await fetchInvoices(sb, from, to, status);
      break;
    case "customers":
    case "subscriptions":
      rows = await fetchCustomers(sb, status);
      break;
    case "field_jobs":
      rows = await fetchFieldJobs(sb, from, to, status);
      break;
    case "tickets":
      rows = await fetchTickets(sb, from, to, status);
      break;
    default:
      return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  }

  if (format === "csv") {
    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
        "Cache-Control":       "no-store",
      },
    });
  }

  // PDF — return a print-ready HTML table (browser prints to PDF)
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const tableRows = rows.map(r =>
    `<tr>${headers.map(h => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`
  ).join("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${filename}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 10px; padding: 20px; }
    h1   { font-size: 14px; margin-bottom: 4px; }
    p    { color: #6b7280; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th   { background: #1D9E75; color: white; padding: 6px 8px; text-align: left; font-size: 9px; }
    td   { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>FiberCRM — ${type.replace("_"," ").replace(/\b\w/g, l => l.toUpperCase())} Report</h1>
  <p>Generated: ${new Date().toLocaleString("en-KE")} · ${rows.length} records
    ${from ? ` · From: ${from}` : ""}${to ? ` to: ${to}` : ""}</p>
  <table>
    <thead><tr>${headers.map(h => `<th>${h.replace(/_/g," ")}</th>`).join("")}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type":        "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control":       "no-store",
    },
  });
}
