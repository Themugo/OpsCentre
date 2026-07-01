// ─── GET /api/cron/daily ──────────────────────────────────────────────────────
// Triggered daily by Vercel Cron (vercel.json) or an external scheduler.
// Calls all Supabase Edge Function crons in sequence.
// Secured by CRON_SECRET env variable.

import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL         = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET          = process.env.CRON_SECRET!;

async function callEdgeFunction(name: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
    });
    return res.json();
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("secret");

  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: Record<string, unknown> = {};

  // 1. Auto-invoice generation + overdue marking + suspensions
  results["auto-invoice"] = await callEdgeFunction("auto-invoice");

  // 2. M-Pesa reconciliation for missed callbacks
  results["reconcile-mpesa"] = await callEdgeFunction("reconcile-mpesa");

  console.log("[cron/daily] Results:", JSON.stringify(results, null, 2));

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), results });
}

// ── GET /api/cron/network ─────────────────────────────────────────────────────
// Separate frequent cron — runs every 5 minutes for network health checks.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await callEdgeFunction("network-poller");
  return NextResponse.json({ ok: true, result });
}
