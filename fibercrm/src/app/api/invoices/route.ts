// ─── /api/invoices ────────────────────────────────────────────────────────────
// GET  — list invoices (filterable by status, customer, date range)
// POST — manually create an invoice

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";

const CreateInvoiceSchema = z.object({
  subscriptionId: z.string().uuid(),
  amountKes:      z.number().positive(),
  dueDate:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes:          z.string().optional(),
  status:         z.enum(["draft", "sent"]).default("sent"),
});

export async function GET(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status     = searchParams.get("status");
  const customerId = searchParams.get("customerId");
  const from       = searchParams.get("from");
  const to         = searchParams.get("to");
  const page       = parseInt(searchParams.get("page") ?? "1", 10);
  const limit      = parseInt(searchParams.get("limit") ?? "50", 10);

  let query = supabase
    .from("invoices")
    .select(`
      id, invoice_no, amount_kes, status, due_date, paid_at, created_at,
      billing_period_start, billing_period_end, notes,
      subscriptions(
        id, customer_id,
        customers(id, name, phone, email),
        service_plans(name, type)
      )
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status)     query = query.eq("status", status);
  if (from)       query = query.gte("due_date", from);
  if (to)         query = query.lte("due_date", to);
  if (customerId) {
    // Supabase REST cant filter on joined table columns directly
    // So we first get subscription IDs for this customer, then filter invoices
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("customer_id", customerId);
    const subIds = (subs ?? []).map((s: any) => s.id);
    if (subIds.length > 0) {
      query = query.in("subscription_id", subIds);
    } else {
      return NextResponse.json({ data: [], meta: { total: 0, page, limit, totalBilledKes: 0, totalCollectedKes: 0, collectionRatePct: 0 } });
    }
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute totals for the filtered set
  const totalBilled    = data?.reduce((s, i) => s + i.amount_kes, 0) ?? 0;
  const totalCollected = data?.filter(i => i.status === "paid")
                              .reduce((s, i) => s + i.amount_kes, 0) ?? 0;

  return NextResponse.json({
    data,
    meta: {
      total: count,
      page,
      limit,
      totalBilledKes:    totalBilled,
      totalCollectedKes: totalCollected,
      collectionRatePct: totalBilled
        ? Math.round((totalCollected / totalBilled) * 100)
        : 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (!user || !["admin", "billing"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = CreateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("invoices")
    .insert({
      subscription_id: parsed.data.subscriptionId,
      amount_kes:      parsed.data.amountKes,
      due_date:        parsed.data.dueDate,
      notes:           parsed.data.notes,
      status:          parsed.data.status,
    })
    .select("id, invoice_no, amount_kes, status, due_date")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
