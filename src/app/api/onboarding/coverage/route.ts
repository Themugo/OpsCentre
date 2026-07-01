// ─── GET /api/onboarding/coverage ────────────────────────────────────────────
// Checks if a given area is within a coverage zone.
// Returns: { covered: boolean, zoneId?, zoneName?, nodeStatus? }

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const area = req.nextUrl.searchParams.get("area");
  if (!area) {
    return NextResponse.json({ error: "area required" }, { status: 400 });
  }

  const sb = createServiceClient();

  // Check if the area matches any active coverage zone
  const { data: zone, error } = await sb
    .from("coverage_zones")
    .select("id, name, county, primary_node_id, network_nodes(status)")
    .eq("is_active", true)
    .ilike("name", `%${area}%`)
    .limit(1)
    .single();

  if (error || !zone) {
    // Also check addresses table for existing customers in this area
    const { count } = await sb
      .from("addresses")
      .select("*", { count: "exact", head: true })
      .ilike("area", `%${area}%`);

    // If we have existing customers there, we cover it
    if ((count ?? 0) > 0) {
      return NextResponse.json({
        covered:  true,
        zoneId:   null,
        zoneName: area,
        nodeStatus: "online",
      });
    }

    return NextResponse.json({ covered: false });
  }

  const nodeStatus = (zone.network_nodes as any)?.status ?? "online";

  return NextResponse.json({
    covered:    true,
    zoneId:     zone.id,
    zoneName:   zone.name,
    nodeStatus,
    // Warn if node is degraded/down
    warning: nodeStatus === "down"
      ? "There is currently a network issue in this area. It will be resolved before your installation."
      : nodeStatus === "degraded"
      ? "There is minor congestion in this area. Our team is working on it."
      : null,
  });
}
