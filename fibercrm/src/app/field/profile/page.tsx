"use client";
// ─── Field App — Profile Page ─────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { useGPSTracking } from "@/hooks/useGPSTracking";
import { createBrowserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { PageSpinner } from "@/components/ui";
import { LogOut, Star } from "lucide-react";

export default function FieldProfilePage() {
  const supabase = createBrowserClient();
  const router   = useRouter();
  const { state: gps, start: startTracking, stop: stopTracking } = useGPSTracking();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => supabase.auth.getSession().then(r => r.data.session),
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ["field-stats"],
    enabled: !!session,
    queryFn: async () => {
      const userId = session!.user.id;
      const now    = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: jobs } = await supabase
        .from("field_jobs")
        .select("id, type, status, scheduled_at, completed_at, started_at")
        .eq("technician_id", userId)
        .eq("status", "done")
        .gte("completed_at", monthStart);

      const { data: profile } = await supabase
        .from("users")
        .select("id, name, email, phone, role, created_at")
        .eq("id", userId)
        .single();

      const total        = jobs?.length ?? 0;
      const installs     = jobs?.filter(j => j.type === "installation").length ?? 0;
      const repairs      = jobs?.filter(j => j.type === "repair").length ?? 0;
      const surveys      = jobs?.filter(j => j.type === "survey").length ?? 0;
      const upgrades     = jobs?.filter(j => j.type === "upgrade").length ?? 0;

      // Avg job duration in minutes
      const durations = jobs
        ?.filter(j => j.started_at && j.completed_at)
        .map(j => (new Date(j.completed_at!).getTime() - new Date(j.started_at!).getTime()) / 60000);
      const avgMins = durations?.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

      return { profile, total, installs, repairs, surveys, upgrades, avgMins };
    },
  });

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (isLoading) return <PageSpinner />;

  const p = stats?.profile as any;

  return (
    <div>
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="text-base font-semibold text-gray-900">My profile</div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Avatar card */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-brand-light flex items-center justify-center text-xl font-bold text-brand-600 flex-shrink-0">
            {p?.name?.slice(0,2).toUpperCase()}
          </div>
          <div>
            <div className="text-base font-semibold text-gray-900">{p?.name}</div>
            <div className="text-sm text-gray-500 capitalize">{p?.role?.replace("_"," ")}</div>
            <div className="text-xs text-gray-400 mt-0.5">{p?.email}</div>
          </div>
        </div>

        {/* This month stats */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
            This month
          </div>
          <div className="divide-y divide-gray-50">
            {[
              ["Jobs completed",  stats?.total],
              ["Installations",   stats?.installs],
              ["Fault repairs",   stats?.repairs],
              ["Site surveys",    stats?.surveys],
              ["Upgrades",        stats?.upgrades],
              ["Avg job time",    stats?.avgMins ? `${stats.avgMins}min` : "—"],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between px-4 py-3 text-sm">
                <span className="text-gray-500">{label}</span>
                <span className="font-semibold text-gray-900">{value ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Customer rating placeholder */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Customer rating</div>
            <div className="text-xs text-gray-400">Based on job feedback</div>
          </div>
          <div className="flex items-center gap-1.5">
            <Star size={16} className="text-amber-400 fill-amber-400" />
            <span className="text-lg font-bold text-gray-900">4.9</span>
            <span className="text-xs text-gray-400">/ 5</span>
          </div>
        </div>

        {/* GPS Tracking toggle */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <div>
              <div className="text-sm font-semibold text-gray-900">Location tracking</div>
              <div className="text-xs text-gray-400">
                {gps.isTracking
                  ? `Tracking · ${gps.lastUpdate ? "Updated " + new Date(gps.lastUpdate).toLocaleTimeString() : "Starting…"}`
                  : "Off · Enable while on duty"}
              </div>
            </div>
            <button
              onClick={() => gps.isTracking ? stopTracking() : startTracking("on_duty")}
              className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${gps.isTracking ? "bg-brand-500 justify-end" : "bg-gray-200 justify-start"}`}>
              <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
            </button>
          </div>
          {gps.batteryPct !== null && (
            <div className="text-xs text-gray-400 mt-1">Battery: {gps.batteryPct}%</div>
          )}
          {gps.error && <div className="text-xs text-red-500 mt-1">{gps.error}</div>}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-sm text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </div>
  );
}
