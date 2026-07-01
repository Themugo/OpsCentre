// ─── /api/tickets/[id] ───────────────────────────────────────────────────────
// GET   — single ticket with comments + related entities
// PATCH — update status, priority, assigned_to
// POST  — add a comment to the ticket

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";
import { notify } from "@/lib/notifications/notify.service";

const UpdateSchema = z.object({
  status:     z.enum(["open","in_progress","resolved","closed"]).optional(),
  priority:   z.enum(["low","medium","high","critical"]).optional(),
  assignedTo: z.string().uuid().optional(),
});

const CommentSchema = z.object({
  body:       z.string().min(1).max(2000),
  isInternal: z.boolean().default(false),
});

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .select(`
      id, ticket_no, category, priority, status, subject, description,
      sla_hours, sla_breached, sla_due_at,
      created_at, resolved_at, closed_at,
      customers(id, name, email, phone),
      users!support_tickets_assigned_to_fkey(id, name, email),
      field_jobs(id, type, status, scheduled_at),
      invoices(id, invoice_no, amount_kes, status),
      ticket_comments(
        id, body, is_internal, created_at,
        users!ticket_comments_author_id_fkey(id, name)
      )
    `)
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  return NextResponse.json({ data: ticket });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (!user || !["admin","support","billing"].includes(user.role)) {
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

  // Fetch old status to detect resolution
  const { data: old } = await sb
    .from("support_tickets")
    .select("status, customers(name, phone, email), ticket_no")
    .eq("id", params.id).single();

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status)     updateData.status      = parsed.data.status;
  if (parsed.data.priority)   updateData.priority    = parsed.data.priority;
  if (parsed.data.assignedTo) updateData.assigned_to = parsed.data.assignedTo;

  const { data, error } = await sb
    .from("support_tickets")
    .update(updateData)
    .eq("id", params.id)
    .select("id, ticket_no, status, priority")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify customer on resolution
  if (
    parsed.data.status === "resolved" &&
    old?.status !== "resolved"
  ) {
    const customer = (old?.customers as any);
    if (customer) {
      notify.ticketResolved({
        customerName:  customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        ticketNo:      (old as any)?.ticket_no,
      }).catch(console.error);
    }
  }

  return NextResponse.json({ data });
}

// ── POST — add comment ────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();
  const { data: comment, error } = await sb
    .from("ticket_comments")
    .insert({
      ticket_id:   params.id,
      author_id:   session.user.id,
      body:        parsed.data.body,
      is_internal: parsed.data.isInternal,
    })
    .select("id, body, is_internal, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-move ticket to in_progress when staff adds first comment
  await sb
    .from("support_tickets")
    .update({ status: "in_progress" })
    .eq("id", params.id)
    .eq("status", "open");

  return NextResponse.json({ data: comment }, { status: 201 });
}
