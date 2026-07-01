// ─── /api/leads ───────────────────────────────────────────────────────────────
// GET  — list leads (filter by stage, source, assigned)
// POST — create new lead

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";

const CreateLeadSchema = z.object({
  name:              z.string().min(2).max(120),
  phone:             z.string().min(9),
  email:             z.string().email().optional(),
  source:            z.enum(["web", "referral", "field", "agent", "walk_in"]),
  stage:             z.enum(["new", "qualified", "proposal", "won", "lost"]).default("new"),
  area:              z.string().optional(),
  monthlyValueKes:   z.number().positive().optional(),
  interestedPlanId:  z.string().uuid().optional(),
  assignedTo:        z.string().uuid().optional(),
  notes:             z.string().optional(),
  nextFollowUpAt:    z.string().datetime().optional(),
});

const UpdateLeadSchema = z.object({
  stage:           z.enum(["new","qualified","proposal","won","lost"]).optional(),
  assignedTo:      z.string().uuid().optional(),
  notes:           z.string().optional(),
  lostReason:      z.string().optional(),
  nextFollowUpAt:  z.string().datetime().optional(),
  monthlyValueKes: z.number().positive().optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const stage  = sp.get("stage");
  const source = sp.get("source");
  const search = sp.get("search");
  const page   = parseInt(sp.get("page") ?? "1");
  const limit  = parseInt(sp.get("limit") ?? "50");

  let query = supabase
    .from("leads")
    .select(`
      id, name, phone, email, source, stage,
      monthly_value_kes, area, next_follow_up_at, created_at, converted_at,
      service_plans(id, name),
      users!leads_assigned_to_fkey(id, name)
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (stage)  query = query.eq("stage", stage);
  if (source) query = query.eq("source", source);
  if (search) query = query.or(
    `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
  );

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pipeline summary
  const summary = {
    new:       data?.filter(l => l.stage === "new").length       ?? 0,
    qualified: data?.filter(l => l.stage === "qualified").length ?? 0,
    proposal:  data?.filter(l => l.stage === "proposal").length  ?? 0,
    won:       data?.filter(l => l.stage === "won").length       ?? 0,
    lost:      data?.filter(l => l.stage === "lost").length      ?? 0,
    totalValue: data
      ?.filter(l => !["won","lost"].includes(l.stage))
      .reduce((s, l) => s + (l.monthly_value_kes ?? 0), 0) ?? 0,
  };

  return NextResponse.json({ data, meta: { total: count, page, limit }, summary });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (!user || !["admin","sales"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("leads")
    .insert({
      name:               parsed.data.name,
      phone:              parsed.data.phone,
      email:              parsed.data.email,
      source:             parsed.data.source,
      stage:              parsed.data.stage,
      area:               parsed.data.area,
      monthly_value_kes:  parsed.data.monthlyValueKes,
      interested_plan_id: parsed.data.interestedPlanId,
      assigned_to:        parsed.data.assignedTo ?? session.user.id,
      notes:              parsed.data.notes,
      next_follow_up_at:  parsed.data.nextFollowUpAt,
    })
    .select("id, name, phone, stage, source")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
