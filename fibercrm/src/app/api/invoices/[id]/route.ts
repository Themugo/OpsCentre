// ─── /api/invoices/[id] ──────────────────────────────────────────────────────
// GET   — single invoice with payments + customer + plan
// PATCH — update status (e.g. mark paid manually, void, mark overdue)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";
import { notify } from "@/lib/notifications/notify.service";

const UpdateSchema = z.object({
  status: z.enum(["draft","sent","pending","paid","overdue"]),
  notes:  z.string().optional(),
});

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id, invoice_no, amount_kes, status,
      due_date, paid_at, created_at,
      billing_period_start, billing_period_end, notes,
      subscriptions(
        id, status, static_ip,
        customers(id, name, email, phone),
        service_plans(id, name, type, speed_down_mbps, speed_up_mbps, price_kes)
      ),
      payments(id, amount_kes, method, mpesa_ref, stripe_ref, paid_at, recorded_by)
    `)
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  return NextResponse.json({ data });
}

// ── PATCH — update status ─────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (!user || !["admin","billing"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();

  // Fetch current invoice to check state and get customer info
  const { data: invoice } = await sb
    .from("invoices")
    .select(`
      id, invoice_no, status, amount_kes,
      subscriptions(customers(name, phone, email))
    `)
    .eq("id", params.id)
    .single();

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updateData: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.notes) updateData.notes = parsed.data.notes;

  // Auto-set paid_at when marking as paid
  if (parsed.data.status === "paid" && invoice.status !== "paid") {
    updateData.paid_at = new Date().toISOString();

    // Record a manual payment entry
    await sb.from("payments").insert({
      invoice_id:  params.id,
      amount_kes:  invoice.amount_kes,
      method:      "cash",
      paid_at:     new Date().toISOString(),
      recorded_by: session.user.id,
      notes:       "Manually marked as paid",
    });

    // Notify customer
    const customer = (invoice.subscriptions as any)?.customers;
    if (customer) {
      notify.paymentReceived({
        customerName:  customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        amountKes:     invoice.amount_kes,
        receiptNo:     "MANUAL",
        invoiceNo:     invoice.invoice_no,
      }).catch(console.error);
    }
  }

  const { data, error } = await sb
    .from("invoices")
    .update(updateData)
    .eq("id", params.id)
    .select("id, invoice_no, status, paid_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
