// ─── GET /api/health ──────────────────────────────────────────────────────────
// Lightweight health check endpoint.
// Used by Vercel, Uptime Robot, or any monitoring service.
// Returns 200 if the app + DB are reachable, 503 otherwise.

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();

  try {
    // Quick DB connectivity check — count one row
    const sb = createServiceClient();
    const { error } = await sb
      .from("users")
      .select("id", { count: "exact", head: true })
      .limit(1);

    if (error) throw error;

    const latencyMs = Date.now() - start;

    return NextResponse.json({
      status:     "ok",
      timestamp:  new Date().toISOString(),
      db:         "connected",
      latency_ms: latencyMs,
      version:    process.env.npm_package_version ?? "1.0.0",
      env:        process.env.NODE_ENV,
    });

  } catch (err: any) {
    const latencyMs = Date.now() - start;
    console.error("[health] DB check failed:", err.message);

    return NextResponse.json(
      {
        status:     "degraded",
        timestamp:  new Date().toISOString(),
        db:         "error",
        error:      err.message,
        latency_ms: latencyMs,
      },
      { status: 503 }
    );
  }
}
