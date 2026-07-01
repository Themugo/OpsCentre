// ─── /api/customers/[id] ─────────────────────────────────────────────────────
// GET   — single customer with full detail
// PATCH — update name, email, phone, address
// DELETE — soft-delete (churn)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";

const UpdateSchema = z.object({
  name:   z.string().min(2).max(120).optional(),
  email:  z.string().email().optional(),
  phone:  z.string().optional(),
  status: z.enum(["active", "suspended", "churned"]).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("customers")
    .select(`
      id, name, email, phone, type, status, created_at,
      addresses(*),
      subscriptions(
        id, status, start_date, next_billing_date, static_ip,
        service_plans(*)
      ),
      invoices: invoices(id, invoice_no, amount_kes, status, due_date, paid_at),
      support_tickets(id, ticket_no, subject, priority, status, created_at)
    `)
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("customers")
    .update(parsed.data)
    .eq("id", params.id)
    .select("id, name, email, phone, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const sb = createServiceClient();

  // Soft delete — mark churned and cancel all active subscriptions
  await sb
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("customer_id", params.id)
    .eq("status", "active");

  const { error } = await sb
    .from("customers")
    .update({ status: "churned" })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
