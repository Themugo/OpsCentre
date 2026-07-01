// ─── /api/broadcasts/[id] ────────────────────────────────────────────────────
// GET    — broadcast detail + send log
// PATCH  — update draft
// DELETE — cancel / delete
// POST   ?action=preview   — preview audience count + sample
// POST   ?action=send      — trigger immediate send (background)
// POST   ?action=cancel    — cancel scheduled broadcast

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";
import { previewAudience, executeBroadcast } from "@/lib/services/broadcast.service";

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: broadcast, error } = await supabase
    .from("broadcasts")
    .select(`
      id, title, channel, status,
      sms_body, email_subject, email_html,
      audience_filter,
      total_recipients, sent_count, failed_count, delivered_count,
      scheduled_at, started_at, completed_at, created_at,
      users!broadcasts_created_by_fkey(name)
    `)
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch send log summary
  const { data: sendSummary } = await supabase
    .from("broadcast_sends")
    .select("channel, status")
    .eq("broadcast_id", params.id);

  const summary = {
    sms_sent:      sendSummary?.filter(s => s.channel === "sms"   && s.status === "sent").length    ?? 0,
    sms_failed:    sendSummary?.filter(s => s.channel === "sms"   && s.status === "failed").length  ?? 0,
    email_sent:    sendSummary?.filter(s => s.channel === "email" && s.status === "sent").length    ?? 0,
    email_failed:  sendSummary?.filter(s => s.channel === "email" && s.status === "failed").length  ?? 0,
  };

  return NextResponse.json({ data: { ...broadcast, send_summary: summary } });
}

// ── POST — actions ────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (!user || !["admin","billing"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const action = req.nextUrl.searchParams.get("action");

  // ── Preview audience ────────────────────────────────────────────────────────
  if (action === "preview") {
    const { data: broadcast } = await supabase
      .from("broadcasts")
      .select("audience_filter, channel")
      .eq("id", params.id)
      .single();

    if (!broadcast) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { recipients, count } = await previewAudience({
      ...(broadcast.audience_filter as object),
      channel: broadcast.channel,
    });

    return NextResponse.json({
      count,
      sample:       recipients.slice(0, 10),
      hasMore:      count > 10,
    });
  }

  // ── Send now ────────────────────────────────────────────────────────────────
  if (action === "send") {
    const sb = createServiceClient();

    // Check broadcast is in a sendable state
    const { data: broadcast } = await sb
      .from("broadcasts")
      .select("id, status, total_recipients")
      .eq("id", params.id)
      .single();

    if (!broadcast) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!["draft","scheduled"].includes(broadcast.status)) {
      return NextResponse.json({ error: `Cannot send — status is '${broadcast.status}'` }, { status: 400 });
    }

    // Mark as sending
    await sb.from("broadcasts").update({ status: "sending" }).eq("id", params.id);

    // Execute in background — don't await (would timeout on large audiences)
    executeBroadcast(params.id).catch(async (err) => {
      console.error(`[broadcast] ${params.id} failed:`, err);
      await sb.from("broadcasts").update({
        status: "failed",
      }).eq("id", params.id);
    });

    return NextResponse.json({ ok: true, message: "Broadcast is sending…" });
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────
  if (action === "cancel") {
    const sb = createServiceClient();
    const { error } = await sb
      .from("broadcasts")
      .update({ status: "cancelled" })
      .eq("id", params.id)
      .in("status", ["draft","scheduled"]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ── PATCH — update draft ──────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const sb = createServiceClient();

  // Only allow editing drafts
  const { data: existing } = await sb
    .from("broadcasts")
    .select("status")
    .eq("id", params.id)
    .single();

  if (!existing || existing.status !== "draft") {
    return NextResponse.json({ error: "Only draft broadcasts can be edited" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  const b = body as Record<string, unknown>;
  if (b.title)           updates.title            = b.title;
  if (b.smsBody)         updates.sms_body         = b.smsBody;
  if (b.emailSubject)    updates.email_subject    = b.emailSubject;
  if (b.emailHtml)       updates.email_html       = b.emailHtml;
  if (b.audienceFilter)  updates.audience_filter  = b.audienceFilter;
  if (b.scheduledAt)     updates.scheduled_at     = b.scheduledAt;

  const { data, error } = await sb
    .from("broadcasts")
    .update(updates)
    .eq("id", params.id)
    .select("id, title, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const sb = createServiceClient();
  const { error } = await sb
    .from("broadcasts")
    .delete()
    .eq("id", params.id)
    .in("status", ["draft","cancelled","failed"]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
