// ─── /api/network ─────────────────────────────────────────────────────────────
// GET  /api/network          — all nodes with latest metrics
// POST /api/network/metrics  — ingest metrics from polling service (service_role only)
// POST /api/network/status   — update node status (service_role only)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";
import { notify } from "@/lib/notifications/notify.service";

// ── GET all nodes ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const includeMetrics = req.nextUrl.searchParams.get("metrics") === "true";

  // Nodes with latest metric
  const { data: nodes, error } = await supabase
    .from("network_nodes")
    .select(`
      id, name, type, location, ip_address, status, last_seen_at, notes, lat, lng,
      ${includeMetrics ? `
        node_metrics(
          throughput_mbps, latency_ms, packet_loss_pct,
          connected_clients, recorded_at
        )
      ` : ""}
    `)
    .order("type")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach only latest metric per node
  const enriched = nodes?.map((node: any) => ({
    ...node,
    latest_metric: node.node_metrics
      ? [...node.node_metrics].sort(
          (a: any, b: any) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
        )[0] ?? null
      : null,
    node_metrics: undefined,
  }));

  // Health summary
  const summary = {
    total:    enriched?.length ?? 0,
    online:   enriched?.filter(n => n.status === "online").length ?? 0,
    degraded: enriched?.filter(n => n.status === "degraded").length ?? 0,
    down:     enriched?.filter(n => n.status === "down").length ?? 0,
  };

  return NextResponse.json({ data: enriched, summary });
}

// ── POST — ingest metrics from polling service ────────────────────────────────
const MetricsSchema = z.object({
  nodeId:           z.string().uuid(),
  throughputMbps:   z.number().min(0),
  latencyMs:        z.number().min(0),
  packetLossPct:    z.number().min(0).max(100),
  connectedClients: z.number().int().min(0).optional(),
  cpuPct:           z.number().min(0).max(100).optional(),
  memoryPct:        z.number().min(0).max(100).optional(),
});

const StatusUpdateSchema = z.object({
  nodeId:  z.string().uuid(),
  status:  z.enum(["online", "degraded", "down"]),
  lastSeen: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  // This endpoint is called by the network polling service using service_role key
  const authHeader = req.headers.get("Authorization");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (authHeader !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const action = req.nextUrl.searchParams.get("action") ?? "metrics";
  const sb = createServiceClient();

  if (action === "metrics") {
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const parsed = MetricsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const d = parsed.data;

    // Insert metric
    await sb.from("node_metrics").insert({
      node_id:           d.nodeId,
      throughput_mbps:   d.throughputMbps,
      latency_ms:        d.latencyMs,
      packet_loss_pct:   d.packetLossPct,
      connected_clients: d.connectedClients,
      cpu_pct:           d.cpuPct,
      memory_pct:        d.memoryPct,
    });

    // Auto-detect degraded/down from metrics
    let newStatus: "online" | "degraded" | "down" = "online";
    if (d.packetLossPct > 10 || d.latencyMs > 200) newStatus = "degraded";
    if (d.packetLossPct > 50 || d.latencyMs > 1000) newStatus = "down";

    // Fetch current status
    const { data: node } = await sb
      .from("network_nodes")
      .select("status, name, location")
      .eq("id", d.nodeId)
      .single();

    if (node && node.status !== newStatus) {
      await sb.from("network_nodes").update({
        status:       newStatus,
        last_seen_at: new Date().toISOString(),
      }).eq("id", d.nodeId);

      // Alert support team if node goes down
      if (newStatus === "down") {
        notify.outageAlert({
          customerName: "Support Team",
          nodeNames:    [`${node.name} (${node.location})`],
        }).catch(console.error);
      }
    } else {
      await sb.from("network_nodes").update({ last_seen_at: new Date().toISOString() })
        .eq("id", d.nodeId);
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "status") {
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const parsed = StatusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    await sb.from("network_nodes").update({
      status:       parsed.data.status,
      last_seen_at: parsed.data.lastSeen ?? new Date().toISOString(),
    }).eq("id", parsed.data.nodeId);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
