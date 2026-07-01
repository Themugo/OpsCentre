"use client";
// ─── Network Monitor Page ─────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { timeAgo, cn } from "@/lib/utils";
import { Badge, StatCard, PageSpinner } from "@/components/ui";
import { RefreshCw, Wifi, WifiOff, AlertTriangle } from "lucide-react";

interface Node {
  id: string;
  name: string;
  type: "core" | "distribution" | "access";
  location: string;
  ip_address: string;
  status: "online" | "degraded" | "down";
  last_seen_at: string;
  latest_metric?: {
    throughput_mbps: number;
    latency_ms: number;
    packet_loss_pct: number;
    connected_clients: number;
    recorded_at: string;
  } | null;
}

const STATUS_ICON = {
  online:   <Wifi size={14} className="text-green-500" />,
  degraded: <AlertTriangle size={14} className="text-amber-500" />,
  down:     <WifiOff size={14} className="text-red-500" />,
};

const STATUS_ROW = {
  online:   "border-l-4 border-green-400",
  degraded: "border-l-4 border-amber-400",
  down:     "border-l-4 border-red-500 bg-red-50",
};

export default function NetworkPage() {
  const supabase = createBrowserClient();
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["network-nodes"],
    queryFn: async () => {
      const res = await fetch("/api/network?metrics=true");
      if (!res.ok) throw new Error("Failed to fetch nodes");
      return res.json() as Promise<{ data: Node[]; summary: any }>;
    },
    refetchInterval: 30_000,  // auto-refresh every 30s
  });

  // Realtime subscription for node status changes
  useEffect(() => {
    const channel = supabase
      .channel("network_nodes_changes")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "network_nodes",
      }, () => {
        refetch();
        setLastRefresh(new Date());
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const nodes   = data?.data ?? [];
  const summary = data?.summary ?? {};

  const byType = (type: string) => nodes.filter(n => n.type === type);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total nodes"   value={summary.total ?? "—"} />
        <StatCard label="Online"        value={summary.online ?? "—"}   change={summary.uptime_pct ? `${summary.uptime_pct}% uptime` : undefined} changeUp />
        <StatCard label="Degraded"      value={summary.degraded ?? "—"} changeUp={(summary.degraded ?? 0) === 0} />
        <StatCard label="Down"          value={summary.down ?? "—"}     change={(summary.down ?? 0) > 0 ? "Action needed" : "All clear"} changeUp={(summary.down ?? 0) === 0} />
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center">
        <div className="text-xs text-gray-400">
          Last updated: {timeAgo(lastRefresh)} · Auto-refreshes every 30s
        </div>
        <button className="btn-secondary text-sm flex items-center gap-1.5"
          onClick={() => { refetch(); setLastRefresh(new Date()); }}
          disabled={isFetching}>
          <RefreshCw size={13} className={cn(isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {isLoading ? <PageSpinner /> : (
        <>
          {/* Core nodes */}
          {byType("core").length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-800 inline-block" />
                Core infrastructure
              </h2>
              <NodeTable nodes={byType("core")} />
            </div>
          )}

          {/* Distribution nodes */}
          {byType("distribution").length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                Distribution nodes
              </h2>
              <NodeTable nodes={byType("distribution")} />
            </div>
          )}

          {/* Access nodes */}
          {byType("access").length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                Access nodes
              </h2>
              <NodeTable nodes={byType("access")} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NodeTable({ nodes }: { nodes: Node[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {["Node","Location","IP","Status","Throughput","Latency","Packet loss","Clients","Last seen"].map(h => (
              <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nodes.map(node => {
            const m = node.latest_metric;
            return (
              <tr key={node.id} className={cn("border-b border-gray-50", STATUS_ROW[node.status])}>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    {STATUS_ICON[node.status]}
                    <span className="font-medium text-gray-900">{node.name}</span>
                  </div>
                </td>
                <td className="py-3 px-3 text-gray-600">{node.location}</td>
                <td className="py-3 px-3 font-mono text-xs text-gray-500">{node.ip_address}</td>
                <td className="py-3 px-3">
                  <Badge variant={node.status === "online" ? "success" : node.status === "degraded" ? "warning" : "danger"}>
                    {node.status}
                  </Badge>
                </td>
                <td className="py-3 px-3 text-gray-700">{m ? `${m.throughput_mbps} Mbps` : "—"}</td>
                <td className="py-3 px-3">
                  {m ? (
                    <span className={cn("font-medium", m.latency_ms > 100 ? "text-red-600" : m.latency_ms > 50 ? "text-amber-600" : "text-green-600")}>
                      {m.latency_ms}ms
                    </span>
                  ) : "—"}
                </td>
                <td className="py-3 px-3">
                  {m ? (
                    <span className={cn("font-medium", m.packet_loss_pct > 5 ? "text-red-600" : "text-gray-700")}>
                      {m.packet_loss_pct}%
                    </span>
                  ) : "—"}
                </td>
                <td className="py-3 px-3 text-gray-600">{m?.connected_clients ?? "—"}</td>
                <td className="py-3 px-3 text-xs text-gray-400">{timeAgo(node.last_seen_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
