// ─── GET /api/onboarding/plans ────────────────────────────────────────────────
// Returns active service plans for the onboarding wizard.
// Public endpoint — no auth required (needed before account creation).

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  const sb = createServiceClient();

  const { data, error } = await sb
    .from("service_plans")
    .select("id, name, type, speed_down_mbps, speed_up_mbps, price_kes, billing_cycle")
    .eq("is_active", true)
    .in("type", ["home", "business"])  // estates are handled separately
    .order("price_kes", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
