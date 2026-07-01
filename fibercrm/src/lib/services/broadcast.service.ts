// ─── Broadcast Service ────────────────────────────────────────────────────────
// Resolves audience from filter, dispatches SMS and email in batches,
// tracks delivery status, and updates broadcast counters.

import { createServiceClient } from "@/lib/supabase";

const supabase = () => createServiceClient();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AudienceFilter {
  status?:    "active" | "suspended" | "churned";
  type?:      "home" | "business" | "estate";
  area?:      string;
  plan_type?: "home" | "business" | "estate";
  channel?:   "sms" | "email" | "both";
}

export interface BroadcastRecipient {
  customer_id: string;
  name:        string;
  phone:       string | null;
  email:       string | null;
  area:        string | null;
  plan_name:   string | null;
}

// ── Audience preview ──────────────────────────────────────────────────────────

export async function previewAudience(
  filter: AudienceFilter
): Promise<{ recipients: BroadcastRecipient[]; count: number }> {
  const sb = supabase();

  const { data, error } = await sb.rpc("preview_broadcast_audience", {
    p_filter: filter,
  });

  if (error) throw new Error(error.message);

  const recipients = (data ?? []) as BroadcastRecipient[];
  return { recipients, count: recipients.length };
}

// ── Send broadcast ────────────────────────────────────────────────────────────

const AT_API_KEY   = process.env.AFRICASTALKING_API_KEY ?? "";
const AT_USERNAME  = process.env.AFRICASTALKING_USERNAME ?? "sandbox";
const RESEND_KEY   = process.env.RESEND_API_KEY ?? "";
const FROM_EMAIL   = process.env.RESEND_FROM_EMAIL ?? "noreply@fibercrm.co.ke";
const FROM_NAME    = process.env.RESEND_FROM_NAME  ?? "FiberCRM";
const BATCH_SIZE   = 10; // sends per batch to avoid rate limits
const BATCH_DELAY  = 1000; // ms between batches

async function sendSingleSMS(phone: string, message: string): Promise<boolean> {
  if (!AT_API_KEY) return false;
  const normalized = phone.replace(/^0/, "+254").replace(/^254/, "+254");
  try {
    const res = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        Accept:         "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey:         AT_API_KEY,
      },
      body: new URLSearchParams({
        username: AT_USERNAME,
        to:       normalized,
        message:  message.slice(0, 160),
      }),
    });
    const data = await res.json();
    const recipient = data?.SMSMessageData?.Recipients?.[0];
    return recipient?.status === "Success";
  } catch {
    return false;
  }
}

async function sendSingleEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!RESEND_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    `${FROM_NAME} <${FROM_EMAIL}>`,
        to:      [to],
        subject,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function executeBroadcast(broadcastId: string): Promise<void> {
  const sb = supabase();

  // Fetch broadcast
  const { data: broadcast, error: bErr } = await sb
    .from("broadcasts")
    .select("*")
    .eq("id", broadcastId)
    .single();

  if (bErr || !broadcast) throw new Error("Broadcast not found");
  if (broadcast.status !== "sending") throw new Error("Broadcast not in sending state");

  // Resolve audience
  const { recipients } = await previewAudience({
    ...(broadcast.audience_filter as AudienceFilter),
    channel: broadcast.channel as 'sms' | 'email' | 'both',
  });

  if (!recipients.length) {
    await sb.from("broadcasts").update({
      status:          "sent",
      total_recipients: 0,
      completed_at:    new Date().toISOString(),
    }).eq("id", broadcastId);
    return;
  }

  // Update total count
  await sb.from("broadcasts").update({
    total_recipients: recipients.length,
    started_at:       new Date().toISOString(),
  }).eq("id", broadcastId);

  // Pre-create send log rows
  const sendRows = recipients.flatMap(r => {
    const rows = [];
    if (["sms", "both"].includes(broadcast.channel) && r.phone) {
      rows.push({
        broadcast_id: broadcastId,
        customer_id:  r.customer_id,
        channel:      "sms",
        recipient:    r.phone,
        status:       "pending",
      });
    }
    if (["email", "both"].includes(broadcast.channel) && r.email) {
      rows.push({
        broadcast_id: broadcastId,
        customer_id:  r.customer_id,
        channel:      "email",
        recipient:    r.email,
        status:       "pending",
      });
    }
    return rows;
  });

  await sb.from("broadcast_sends").insert(sendRows);

  let sentCount   = 0;
  let failedCount = 0;

  // Process in batches
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (recipient) => {
      // SMS
      if (["sms", "both"].includes(broadcast.channel) && recipient.phone) {
        // Personalise message — replace {{name}} placeholder
        const smsBody = (broadcast.sms_body ?? "").replace(
          /\{\{name\}\}/gi,
          recipient.name.split(" ")[0] // first name only
        );
        const ok = await sendSingleSMS(recipient.phone, smsBody);
        await sb.from("broadcast_sends").update({
          status:  ok ? "sent" : "failed",
          sent_at: ok ? new Date().toISOString() : null,
        }).eq("broadcast_id", broadcastId)
          .eq("customer_id", recipient.customer_id)
          .eq("channel", "sms");

        if (ok) sentCount++;
        else failedCount++;
      }

      // Email
      if (["email", "both"].includes(broadcast.channel) && recipient.email) {
        // Personalise email HTML
        const emailHtml = (broadcast.email_html ?? "").replace(
          /\{\{name\}\}/gi,
          recipient.name.split(" ")[0]
        );
        const ok = await sendSingleEmail(
          recipient.email,
          broadcast.email_subject ?? "Message from FiberCRM",
          emailHtml
        );
        await sb.from("broadcast_sends").update({
          status:  ok ? "sent" : "failed",
          sent_at: ok ? new Date().toISOString() : null,
        }).eq("broadcast_id", broadcastId)
          .eq("customer_id", recipient.customer_id)
          .eq("channel", "email");

        if (ok) sentCount++;
        else failedCount++;
      }
    }));

    // Update progress counters after each batch
    await sb.from("broadcasts").update({
      sent_count:   sentCount,
      failed_count: failedCount,
    }).eq("id", broadcastId);

    // Rate limit delay between batches
    if (i + BATCH_SIZE < recipients.length) {
      await sleep(BATCH_DELAY);
    }
  }

  // Mark complete
  await sb.from("broadcasts").update({
    status:       failedCount === recipients.length ? "failed" : "sent",
    sent_count:    sentCount,
    failed_count:  failedCount,
    completed_at:  new Date().toISOString(),
  }).eq("id", broadcastId);

  console.log(`[broadcast] ${broadcastId} complete — sent: ${sentCount}, failed: ${failedCount}`);
}
