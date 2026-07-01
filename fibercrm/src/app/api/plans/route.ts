// ─── /api/plans ──────────────────────────────────────────────────────────────
// GET    — list all plans
// POST   — create plan
// PATCH  — update plan (via ?id=)
// DELETE — delete plan (via ?id=, only if no active subscriptions)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";

const PlanSchema = z.object({
  name:            z.string().min(2).max(80),
  type:            z.enum(["home","business","estate"]),
  speed_down_mbps: z.number().int().positive(),
  speed_up_mbps:   z.number().int().positive(),
  price_kes:       z.number().positive(),
  billing_cycle:   z.enum(["monthly","quarterly","annual"]),
  is_active:       z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const includeInactive = req.nextUrl.searchParams.get("all") === "true";

  let query = supabase
    .from("service_plans")
    .select(`
      id, name, type, speed_down_mbps, speed_up_mbps,
      price_kes, billing_cycle, is_active,
      subscriptions:subscriptions(count)
    `)
    .order("type").order("price_kes");

  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count active subscribers per plan
  const enriched = (data ?? []).map((p: any) => ({
    ...p,
    subscriber_count: Array.isArray(p.subscriptions)
      ? p.subscriptions.filter((s: any) => s.status === "active").length
      : 0,
    subscriptions: undefined,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(req: NextRequest) {
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

  const parsed = PlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("service_plans")
    .insert(parsed.data)
    .select("id, name, type, price_kes, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

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

  const parsed = PlanSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("service_plans")
    .update(parsed.data)
    .eq("id", id)
    .select("id, name, type, price_kes, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // Block delete if active subscriptions exist
  const { count } = await supabase
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("plan_id", id)
    .eq("status", "active");

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${count} active subscriptions use this plan. Deactivate it instead.` },
      { status: 409 }
    );
  }

  const sb = createServiceClient();
  const { error } = await sb.from("service_plans").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
