"use client";
// ─── Portal Notifications Page ────────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { timeAgo } from "@/lib/utils";
import { PageSpinner } from "@/components/ui";
import { Bell, CreditCard, Wifi, WifiOff, HeadphonesIcon, ArrowUpCircle, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: string; type: string; title: string; body: string;
  is_read: boolean; created_at: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  invoice:    <CreditCard    size={16} className="text-amber-500" />,
  payment:    <CreditCard    size={16} className="text-green-500" />,
  outage:     <WifiOff       size={16} className="text-red-500"   />,
  ticket:     <HeadphonesIcon size={16} className="text-purple-500" />,
  upgrade:    <ArrowUpCircle size={16} className="text-brand-500" />,
  general:    <Bell          size={16} className="text-gray-400"  />,
};

const PREFS = [
  { key: "invoices", label: "Invoice reminders",  sub: "Get notified before bills are due",        on: true  },
  { key: "payments", label: "Payment receipts",   sub: "Confirmation when payments are received",  on: true  },
  { key: "outages",  label: "Outage alerts",       sub: "Know about network issues immediately",    on: true  },
  { key: "tickets",  label: "Ticket updates",      sub: "When your support tickets are updated",    on: true  },
  { key: "promos",   label: "Promotional offers",  sub: "Upgrade offers and new plan announcements",on: false },
];

export default function PortalNotificationsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["portal-notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=50");
      if (!res.ok) return { data: [], unreadCount: 0 };
      return res.json() as Promise<{ data: Notification[]; unreadCount: number }>;
    },
    refetchInterval: 30_000,
  });

  const notifications = data?.data ?? [];
  const unreadCount   = data?.unreadCount ?? 0;

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch("/api/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-notifications"] }),
  });

  const markOneRead = useMutation({
    mutationFn: async (id: string) => {
      await fetch("/api/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-notifications"] }),
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {unreadCount > 0 ? <span className="font-semibold text-gray-900">{unreadCount} unread</span> : "All caught up ✓"}
        </div>
        {unreadCount > 0 && (
          <button className="text-xs text-brand-600 hover:underline flex items-center gap-1"
            onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            <CheckCheck size={12} /> {markAllRead.isPending ? "Marking…" : "Mark all read"}
          </button>
        )}
      </div>

      {isLoading ? <PageSpinner /> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Bell size={32} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : notifications.map(n => (
            <button key={n.id}
              className={cn("w-full flex gap-3 p-4 text-left transition-colors hover:bg-gray-50", !n.is_read && "bg-blue-50/40")}
              onClick={() => { if (!n.is_read) markOneRead.mutate(n.id); }}>
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                {TYPE_ICON[n.type] ?? TYPE_ICON.general}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className={cn("text-sm", !n.is_read ? "font-semibold text-gray-900" : "font-medium text-gray-700")}>
                    {n.title}
                  </span>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Notification preferences</h2>
        <div className="space-y-4">
          {PREFS.map(pref => (
            <div key={pref.key} className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-gray-900">{pref.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{pref.sub}</div>
              </div>
              <div className={cn("w-10 h-5 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors cursor-pointer",
                pref.on ? "bg-brand-500 justify-end" : "bg-gray-200 justify-start")}>
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
