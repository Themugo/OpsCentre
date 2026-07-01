// ─── GET /api/customers/[id]/subscriptions ────────────────────────────────────
// Returns all subscriptions for a specific customer with full plan details.
// Used by: customer detail modal, portal overview, subscription management UI.

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Customers can only view their own subscriptions
  const { data: user } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();

  const isStaff    = user && ["admin","billing","support","sales"].includes(user.role);
  const isOwnData  = session.user.id === params.id;

  if (!isStaff && !isOwnData) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select(`
      id, status, start_date, next_billing_date, static_ip,
      created_at, updated_at,
      service_plans(
        id, name, type,
        speed_down_mbps, speed_up_mbps,
        price_kes, billing_cycle
      ),
      invoices(
        id, invoice_no, amount_kes, status, due_date, paid_at
      )
    `)
    .eq("customer_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with billing summary
  const enriched = (data ?? []).map((sub: any) => {
    const invoices      = sub.invoices ?? [];
    const paidInvoices  = invoices.filter((i: any) => i.status === "paid");
    const totalPaid     = paidInvoices.reduce((s: number, i: any) => s + i.amount_kes, 0);
    const pendingCount  = invoices.filter((i: any) =>
      ["pending","sent","overdue"].includes(i.status)
    ).length;

    return {
      ...sub,
      invoices:      undefined,   // don't return all invoices in this route
      billing: {
        invoiceCount:  invoices.length,
        paidCount:     paidInvoices.length,
        pendingCount,
        totalPaidKes:  totalPaid,
      },
    };
  });

  return NextResponse.json({ data: enriched });
}
