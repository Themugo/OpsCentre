"use client";
// ─── Topbar ───────────────────────────────────────────────────────────────────

import { useRouter, usePathname } from "next/navigation";
import { Bell, LogOut, Search } from "lucide-react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

interface Props {
  user: { name: string; role: string; email: string };
}

const PAGE_TITLES: Record<string, string> = {
  "/dashboard":              "Dashboard",
  "/dashboard/customers":    "Customers",
  "/dashboard/leads":        "Leads",
  "/dashboard/tickets":      "Support Tickets",
  "/dashboard/invoices":     "Billing & Invoices",
  "/dashboard/plans":        "Service Plans",
  "/dashboard/field-jobs":   "Field Jobs",
  "/dashboard/network":      "Network Monitor",
  "/dashboard/reports":      "Finance & Reports",
  "/dashboard/settings":     "Settings",
};

export function Topbar({ user }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const supabase = createBrowserClient();

  const title = PAGE_TITLES[pathname] ?? "FiberCRM";

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-5 flex-shrink-0">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>

      <div className="flex items-center gap-2">
        {/* Search */}
        <button className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <Search size={16} />
        </button>

        {/* Notifications */}
        <Link href="/dashboard/broadcasts" className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors inline-flex">
          <Bell size={16} />
        </Link>

        {/* User */}
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200 ml-1">
          <div className="w-7 h-7 rounded-full bg-brand-light flex items-center justify-center text-xs font-semibold text-brand-600">
            {user.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="hidden sm:block">
            <div className="text-xs font-medium text-gray-800">{user.name}</div>
            <div className="text-[10px] text-gray-400 capitalize">{user.role}</div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Sign out"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
