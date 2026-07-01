// ─── Supabase Edge Function: network-poller ───────────────────────────────────
// Runs every 5 minutes via cron.
// Pings all active network nodes, writes metrics, auto-detects status changes,
// and sends outage alerts via Africa's Talking SMS.
//
// Deploy: supabase functions deploy network-poller
// Cron:   every 5 minutes → '*/5 * * * *'
//
// NOTE: Supabase Edge Functions cannot open raw TCP sockets, so real SNMP/ICMP
// pings require an external agent (a lightweight Node.js process on each node
// that POSTs metrics to /api/network?action=metrics).
// This function handles the SCHEDULING and ALERTING side.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL              = Deno.env.get("NEXT_PUBLIC_APP_URL")!;
const AT_API_KEY           = Deno.env.get("AFRICASTALKING_API_KEY") ?? "";
const AT_USERNAME          = Deno.env.get("AFRICASTALKING_USERNAME") ?? "sandbox";
const SUPPORT_PHONES       = (Deno.env.get("SUPPORT_PHONES") ?? "").split(",").filter(Boolean);

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function sendAlertSMS(phones: string[], message: string): Promise<void> {
  if (!AT_API_KEY || !phones.length) return;
  for (const phone of phones) {
    const normalized = phone.trim().replace(/^0/, "+254").replace(/^254/, "+254");
    await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey: AT_API_KEY,
      },
      body: new URLSearchParams({
        username: AT_USERNAME,
        to:       normalized,
        message:  message.slice(0, 160),
      }),
    }).catch(console.error);
  }
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SUPABASE_SERVICE_KEY}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Fetch all nodes and their last metric
  const { data: nodes, error } = await sb
    .from("network_nodes")
    .select("id, name, location, status, last_seen_at, ip_address");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const now        = new Date();
  const alerts: string[] = [];
  let checked = 0;

  for (const node of nodes ?? []) {
    const lastSeen    = new Date(node.last_seen_at);
    const minutesAgo  = (now.getTime() - lastSeen.getTime()) / 60000;

    // Determine health from last_seen_at staleness
    // Real polling agents update last_seen_at every 5min
    let detectedStatus: "online" | "degraded" | "down" = "online";
    if (minutesAgo > 15)  detectedStatus = "down";
    else if (minutesAgo > 7) detectedStatus = "degraded";

    // Status changed — update and alert
    if (detectedStatus !== node.status) {
      await sb.from("network_nodes").update({
        status: detectedStatus,
      }).eq("id", node.id);

      const msg = `FiberCRM ALERT: Node "${node.name}" (${node.location}) is now ${detectedStatus.toUpperCase()}. Last seen ${Math.round(minutesAgo)}min ago. IP: ${node.ip_address}`;
      console.log(msg);

      if (detectedStatus === "down" || detectedStatus === "degraded") {
        alerts.push(msg);
      }
    }

    // Auto-open support ticket for newly-down nodes
    if (detectedStatus === "down" && node.status !== "down") {
      // Check no open ticket already exists for this node
      const { count } = await sb
        .from("support_tickets")
        .select("*", { count: "exact", head: true })
        .ilike("subject", `%${node.name}%`)
        .in("status", ["open", "in_progress"]);

      if (!count) {
        // Find a support/admin user to assign to
        const { data: supportUser } = await sb
          .from("users")
          .select("id")
          .in("role", ["admin", "support"])
          .eq("is_active", true)
          .limit(1)
          .single();

        // Get a dummy customer ID (system ticket)
        // In production, you'd have a system/internal customer row
        const { data: systemCustomer } = await sb
          .from("customers")
          .select("id")
          .limit(1)
          .single();

        if (systemCustomer) {
          await sb.from("support_tickets").insert({
            customer_id:  systemCustomer.id,
            assigned_to:  supportUser?.id,
            category:     "technical",
            priority:     "critical",
            subject:      `Network outage: ${node.name} is DOWN`,
            description:  `Automated alert: node ${node.name} (${node.location}, IP: ${node.ip_address}) has been unreachable for over 15 minutes. Last seen: ${lastSeen.toISOString()}`,
            status:       "open",
          });
        }
      }
    }

    checked++;
  }

  // Send consolidated SMS alerts
  if (alerts.length > 0 && SUPPORT_PHONES.length > 0) {
    const consolidated = alerts.length === 1
      ? alerts[0]
      : `FiberCRM: ${alerts.length} network alerts — check dashboard. Nodes affected: ${(nodes ?? []).filter(n => n.status !== "online").map((n: any) => n.name).join(", ")}`;
    await sendAlertSMS(SUPPORT_PHONES, consolidated);
  }

  // Purge old metrics (keep 90 days)
  await sb.rpc("purge_old_node_metrics").catch(console.error);

  console.log(`[network-poller] Checked ${checked} nodes, sent ${alerts.length} alerts`);

  return new Response(
    JSON.stringify({ ok: true, checked, alerts: alerts.length }),
    { headers: { "Content-Type": "application/json" } }
  );
});
