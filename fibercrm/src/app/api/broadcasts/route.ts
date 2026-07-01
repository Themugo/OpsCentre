// ─── /api/broadcasts ─────────────────────────────────────────────────────────
// GET  — list broadcasts with stats
// POST — create draft broadcast

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";

const CreateSchema = z.object({
  title:          z.string().min(2).max(200),
  channel:        z.enum(["sms", "email", "both"]),
  smsBody:        z.string().max(160).optional(),
  emailSubject:   z.string().max(200).optional(),
  emailHtml:      z.string().optional(),
  audienceFilter: z.object({
    status:    z.enum(["active","suspended","churned"]).optional(),
    type:      z.enum(["home","business","estate"]).optional(),
    area:      z.string().optional(),
    plan_type: z.enum(["home","business","estate"]).optional(),
  }).default({}),
  scheduledAt: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const page  = parseInt(req.nextUrl.searchParams.get("page") ?? "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");

  const { data, error, count } = await supabase
    .from("broadcasts")
    .select(`
      id, title, channel, status,
      total_recipients, sent_count, failed_count, delivered_count,
      audience_filter, scheduled_at, started_at, completed_at, created_at,
      users!broadcasts_created_by_fkey(name)
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, meta: { total: count, page, limit } });
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

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const d = parsed.data;

  // Validate: SMS needs smsBody, email needs subject + html
  if (["sms","both"].includes(d.channel) && !d.smsBody) {
    return NextResponse.json({ error: "SMS body required" }, { status: 422 });
  }
  if (["email","both"].includes(d.channel) && (!d.emailSubject || !d.emailHtml)) {
    return NextResponse.json({ error: "Email subject and body required" }, { status: 422 });
  }

  const sb = createServiceClient();
  const { data: broadcast, error } = await sb
    .from("broadcasts")
    .insert({
      title:           d.title,
      channel:         d.channel,
      sms_body:        d.smsBody,
      email_subject:   d.emailSubject,
      email_html:      d.emailHtml,
      audience_filter: d.audienceFilter,
      scheduled_at:    d.scheduledAt,
      status:          d.scheduledAt ? "scheduled" : "draft",
      created_by:      session.user.id,
    })
    .select("id, title, channel, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: broadcast }, { status: 201 });
}
