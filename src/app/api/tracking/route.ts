// ─── /api/tracking ───────────────────────────────────────────────────────────
// POST — technician updates their GPS location (called by field app every 2min)
// GET  — dispatch reads all active technician locations

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";

const UpdateLocationSchema = z.object({
  lat:          z.number().min(-90).max(90),
  lng:          z.number().min(-180).max(180),
  accuracyM:    z.number().positive().optional(),
  heading:      z.number().min(0).max(360).optional(),
  speedKmh:     z.number().min(0).optional(),
  status:       z.enum(["on_duty","en_route","at_site","off_duty"]).default("on_duty"),
  currentJobId: z.string().uuid().optional(),
  batteryPct:   z.number().min(0).max(100).int().optional(),
});

// ── POST — update location ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Only technicians can push location
  const { data: user } = await supabase
    .from("users").select("name, role").eq("id", session.user.id).single();
  if (!user || !["tech","admin"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = UpdateLocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const d  = parsed.data;
  const sb = createServiceClient();

  // Upsert live location
  const { error } = await sb
    .from("technician_locations")
    .upsert({
      user_id:        session.user.id,
      name:           user.name,
      lat:            d.lat,
      lng:            d.lng,
      accuracy_m:     d.accuracyM,
      heading:        d.heading,
      speed_kmh:      d.speedKmh,
      status:         d.status,
      current_job_id: d.currentJobId,
      battery_pct:    d.batteryPct,
      updated_at:     new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Append to history (fire-and-forget)
  sb.from("technician_location_history").insert({
    user_id:     session.user.id,
    lat:         d.lat,
    lng:         d.lng,
    status:      d.status,
    recorded_at: new Date().toISOString(),
  }).then().catch(console.error);

  return NextResponse.json({ ok: true });
}

// ── GET — all active technician locations ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (!user || !["admin","support","tech"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only show technicians seen in the last 30 minutes
  const { data, error } = await supabase
    .from("technician_locations")
    .select(`
      id, name, lat, lng, accuracy_m, heading, speed_kmh,
      status, battery_pct, updated_at,
      field_jobs(id, type, status, customers(name))
    `)
    .neq("status", "off_duty")
    .gte("updated_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
