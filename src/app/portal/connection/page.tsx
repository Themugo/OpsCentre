// ─── Portal Connection Page ───────────────────────────────────────────────────
import { createServerComponentClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";

export default async function PortalConnectionPage() {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: sub } = await supabase
    .from("subscriptions")
    .select(`id, status, start_date, next_billing_date, static_ip,
      service_plans(name, speed_down_mbps, speed_up_mbps, price_kes, billing_cycle)`)
    .eq("customer_id", session.user.id)
    .eq("status", "active")
    .single();

  const { data: metrics } = await supabase
    .from("node_metrics")
    .select("throughput_mbps, latency_ms, packet_loss_pct, recorded_at")
    .order("recorded_at", { ascending: false })
    .limit(7);

  const plan = (sub as any)?.service_plans;

  const rows = [
    ["Plan name",      plan?.name ?? "—"],
    ["Download speed", plan ? `${plan.speed_down_mbps} Mbps` : "—"],
    ["Upload speed",   plan ? `${plan.speed_up_mbps} Mbps` : "—"],
    ["Data cap",       "Unlimited"],
    ["Static IP",      (sub as any)?.static_ip ?? "—"],
    ["Active since",   sub ? formatDate(sub.start_date) : "—"],
    ["Next billing",   sub ? formatDate(sub.next_billing_date) : "—"],
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Plan details</div>
        {rows.map(([l, v]) => (
          <div key={l} className="flex justify-between px-4 py-3 border-b border-gray-50 last:border-0 text-sm">
            <span className="text-gray-500">{l}</span>
            <span className="font-medium text-gray-900 font-mono text-xs">{v}</span>
          </div>
        ))}
      </div>

      {metrics && metrics.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Speed history (last 7 readings)</div>
          <div className="p-4">
            <div className="flex items-end gap-2 h-20">
              {metrics.map((m: any, i: number) => {
                const pct = Math.min(100, Math.round((m.throughput_mbps / (plan?.speed_down_mbps ?? 100)) * 100));
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t" style={{ height: `${Math.max(10, pct)}%`, background: i === 0 ? "#1D9E75" : "#B5D4F4" }} />
                    <span className="text-[9px] text-gray-400">{new Date(m.recorded_at).getHours()}h</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Avg download", value: `${Math.round(metrics.reduce((s: number, m: any) => s + m.throughput_mbps, 0) / metrics.length)} Mbps` },
                { label: "Avg latency",  value: `${Math.round(metrics.reduce((s: number, m: any) => s + m.latency_ms, 0) / metrics.length)}ms` },
                { label: "Packet loss",  value: `${(metrics.reduce((s: number, m: any) => s + m.packet_loss_pct, 0) / metrics.length).toFixed(1)}%` },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg py-2">
                  <div className="text-base font-bold text-gray-900">{s.value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
