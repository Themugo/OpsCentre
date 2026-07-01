"use client";
// ─── Sidebar — complete nav with ALL modules wired ───────────────────────────

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, FileText, Wifi, Wrench,
  BarChart2, Settings, Package, HeadphonesIcon,
  Navigation, Send, Map, UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "admin" | "billing" | "sales" | "support" | "tech";

interface NavItem {
  label:  string;
  href:   string;
  icon:   React.ReactNode;
  roles:  Role[];
  badge?: string;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Overview",
    items: [
      { label: "Dashboard",     href: "/dashboard",              icon: <LayoutDashboard size={15} />, roles: ["admin","billing","sales","support"] },
    ],
  },
  {
    section: "CRM",
    items: [
      { label: "Customers",     href: "/dashboard/customers",    icon: <Users size={15} />,           roles: ["admin","billing","sales","support"] },
      { label: "Leads",         href: "/dashboard/leads",        icon: <Navigation size={15} />,      roles: ["admin","sales"] },
      { label: "Tickets",       href: "/dashboard/tickets",      icon: <HeadphonesIcon size={15} />,  roles: ["admin","support","billing"] },
    ],
  },
  {
    section: "Billing",
    items: [
      { label: "Invoices",      href: "/dashboard/invoices",     icon: <FileText size={15} />,        roles: ["admin","billing"] },
      { label: "Service plans", href: "/dashboard/plans",        icon: <Package size={15} />,         roles: ["admin","billing"] },
    ],
  },
  {
    section: "Operations",
    items: [
      { label: "Field jobs",    href: "/dashboard/field-jobs",   icon: <Wrench size={15} />,          roles: ["admin","support"] },
      { label: "Network",       href: "/dashboard/network",      icon: <Wifi size={15} />,            roles: ["admin","support"] },
      { label: "Coverage map",  href: "/dashboard/map",          icon: <Map size={15} />,             roles: ["admin","support","sales"] },
    ],
  },
  {
    section: "Communications",
    items: [
      { label: "Broadcasts",    href: "/dashboard/broadcasts",   icon: <Send size={15} />,            roles: ["admin","billing","sales"] },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Reports",       href: "/dashboard/reports",      icon: <BarChart2 size={15} />,       roles: ["admin","billing"] },
    ],
  },
  {
    section: "Admin",
    items: [
      { label: "Onboarding",    href: "/onboarding",             icon: <UserPlus size={15} />,        roles: ["admin","sales"], badge: "New" },
      { label: "Settings",      href: "/dashboard/settings",     icon: <Settings size={15} />,        roles: ["admin"] },
    ],
  },
];

export function Sidebar({ role, userName }: { role: Role; userName?: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-52 min-w-[208px] bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white text-sm font-bold">FC</div>
          <div>
            <div className="text-sm font-semibold text-gray-900">FiberCRM</div>
            <div className="text-xs text-gray-400">ERP + Billing</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {NAV.map(({ section, items }) => {
          const visible = items.filter(i => i.roles.includes(role));
          if (!visible.length) return null;
          return (
            <div key={section} className="mb-3">
              <div className="px-4 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{section}</div>
              {visible.map(item => {
                const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href} className={cn("nav-item", active && "nav-item-active")}>
                    {item.icon}
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[9px] font-semibold bg-brand-500 text-white px-1.5 py-0.5 rounded-full">{item.badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
          <div className="w-7 h-7 rounded-full bg-brand-light flex items-center justify-center text-xs font-semibold text-brand-600 flex-shrink-0">
            {(userName ?? role)[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-800 truncate">{userName ?? "Staff"}</div>
            <div className="text-[10px] text-gray-400 capitalize">{role}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
