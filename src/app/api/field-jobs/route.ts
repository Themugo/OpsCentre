// ─── /api/field-jobs ─────────────────────────────────────────────────────────
// GET  — list jobs (filter by status, technician, date)
// POST — create / assign a new job

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";
import { notify } from "@/lib/notifications/notify.service";
import { format } from "date-fns";

const CreateJobSchema = z.object({
  type:          z.enum(["installation", "repair", "survey", "upgrade"]),
  customerId:    z.string().uuid(),
  addressId:     z.string().uuid().optional(),
  technicianId:  z.string().uuid().optional(),
  scheduledAt:   z.string().datetime(),
  priority:      z.enum(["low", "medium", "high", "critical"]).default("medium"),
  notes:         z.string().optional(),
  checklist:     z.array(z.object({ label: z.string(), done: z.boolean() })).optional(),
});

const UpdateJobSchema = z.object({
  status:          z.enum(["scheduled","en_route","in_progress","done","cancelled"]).optional(),
  technicianId:    z.string().uuid().optional(),
  notes:           z.string().optional(),
  resolutionNotes: z.string().optional(),
  checklist:       z.array(z.object({ label: z.string(), done: z.boolean() })).optional(),
  photos:          z.array(z.string()).optional(),
  signatureUrl:    z.string().optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status  = searchParams.get("status");
  const techId  = searchParams.get("technicianId");
  const date    = searchParams.get("date");   // YYYY-MM-DD
  const today   = searchParams.get("today");  // "true"

  let query = supabase
    .from("field_jobs")
    .select(`
      id, type, status, priority, scheduled_at, started_at, completed_at, notes,
      customers(id, name, phone),
      addresses(street, area),
      users!field_jobs_technician_id_fkey(id, name)
    `)
    .order("scheduled_at", { ascending: true });

  if (status) query = query.eq("status", status);
  if (techId) query = query.eq("technician_id", techId);
  if (today === "true") {
    const todayStr = new Date().toISOString().slice(0, 10);
    query = query.gte("scheduled_at", `${todayStr}T00:00:00Z`)
                 .lte("scheduled_at", `${todayStr}T23:59:59Z`);
  } else if (date) {
    query = query.gte("scheduled_at", `${date}T00:00:00Z`)
                 .lte("scheduled_at", `${date}T23:59:59Z`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (!user || !["admin", "support"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = CreateJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();
  const { data: job, error } = await sb
    .from("field_jobs")
    .insert({
      type:           parsed.data.type,
      customer_id:    parsed.data.customerId,
      address_id:     parsed.data.addressId,
      technician_id:  parsed.data.technicianId,
      assigned_by:    session.user.id,
      status:         "scheduled",
      priority:       parsed.data.priority,
      scheduled_at:   parsed.data.scheduledAt,
      notes:          parsed.data.notes,
      checklist:      parsed.data.checklist ?? [],
    })
    .select("id, type, status, scheduled_at, customers(name, phone)")
    .single();

  if (error || !job) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }

  // Notify customer
  const customer = (job.customers as any);
  if (customer?.phone) {
    notify.fieldJobScheduled({
      customerName:  customer.name,
      customerPhone: customer.phone,
      jobDate:       format(new Date(parsed.data.scheduledAt), "dd MMM yyyy, HH:mm"),
    }).catch(console.error);
  }

  return NextResponse.json({ data: job }, { status: 201 });
}
