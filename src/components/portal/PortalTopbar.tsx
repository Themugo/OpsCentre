"use client";
// ─── Portal Topbar ────────────────────────────────────────────────────────────

import { useRouter, usePathname } from "next/navigation";
import { LogOut, Bell } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";

const TITLES: Record<string, string> = {
  "/portal":               "Overview",
  "/portal/connection":    "My connection",
  "/portal/invoices":      "Invoices",
  "/portal/tickets":       "Support",
  "/portal/profile":       "Profile",
  "/portal/upgrade":       "Upgrade plan",
  "/portal/notifications": "Notifications",
};

export function PortalTopbar({
  customerName,
  nextBilling,
}: {
  customerName: string;
  nextBilling?: string;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const supabase = createBrowserClient();
  const title    = TITLES[pathname] ?? "Portal";

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-5 flex-shrink-0">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-3">
        {nextBilling && (
          <div className="hidden sm:block text-xs text-gray-400">
            Next bill: <span className="font-medium text-gray-700">{formatDate(nextBilling)}</span>
          </div>
        )}
        <button className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <Bell size={16} />
        </button>
        <button
          onClick={handleLogout}
          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
          title="Sign out"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
