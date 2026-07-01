// ─── /api/tickets ─────────────────────────────────────────────────────────────
// GET  — list tickets with filters
// POST — create new ticket

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";
import { notify } from "@/lib/notifications/notify.service";

const CreateTicketSchema = z.object({
  customerId:  z.string().uuid(),
  category:    z.enum(["billing", "technical", "general"]),
  priority:    z.enum(["low", "medium", "high", "critical"]).optional(),
  subject:     z.string().min(3).max(200),
  description: z.string().optional(),
  assignedTo:  z.string().uuid().optional(),
  relatedJobId:     z.string().uuid().optional(),
  relatedInvoiceId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status     = searchParams.get("status");
  const priority   = searchParams.get("priority");
  const category   = searchParams.get("category");
  const customerId = searchParams.get("customerId");
  const assignedTo = searchParams.get("assignedTo");
  const page       = parseInt(searchParams.get("page") ?? "1", 10);
  const limit      = parseInt(searchParams.get("limit") ?? "50", 10);

  let query = supabase
    .from("support_tickets")
    .select(`
      id, ticket_no, subject, category, priority, status,
      sla_breached, sla_due_at, created_at, resolved_at,
      customers(id, name, phone),
      users!support_tickets_assigned_to_fkey(id, name)
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status)     query = query.eq("status", status);
  if (priority)   query = query.eq("priority", priority);
  if (category)   query = query.eq("category", category);
  if (customerId) query = query.eq("customer_id", customerId);
  if (assignedTo) query = query.eq("assigned_to", assignedTo);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, meta: { total: count, page, limit } });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = CreateTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();
  const { data: ticket, error } = await sb
    .from("support_tickets")
    .insert({
      customer_id:         parsed.data.customerId,
      category:            parsed.data.category,
      priority:            parsed.data.priority ?? "medium",
      subject:             parsed.data.subject,
      description:         parsed.data.description,
      assigned_to:         parsed.data.assignedTo,
      related_job_id:      parsed.data.relatedJobId,
      related_invoice_id:  parsed.data.relatedInvoiceId,
      status:              "open",
    })
    .select("id, ticket_no, subject, priority, status, customers(name, phone, email)")
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }

  // Notify customer
  const customer = (ticket.customers as any);
  if (customer) {
    notify.ticketOpened({
      customerName:  customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      ticketNo:      ticket.ticket_no,
    }).catch(console.error);
  }

  return NextResponse.json({ data: ticket }, { status: 201 });
}
