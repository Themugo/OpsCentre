"use client";
// ─── Portal Sidebar ───────────────────────────────────────────────────────────

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Wifi, FileText,
  HeadphonesIcon, User, ArrowUpCircle, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Overview",    href: "/portal",              icon: <LayoutDashboard size={15} /> },
  { label: "Connection",  href: "/portal/connection",   icon: <Wifi size={15} /> },
  { label: "Invoices",    href: "/portal/invoices",     icon: <FileText size={15} /> },
  { label: "Support",     href: "/portal/tickets",      icon: <HeadphonesIcon size={15} /> },
  { label: "Profile",     href: "/portal/profile",      icon: <User size={15} /> },
  { label: "Upgrade",     href: "/portal/upgrade",      icon: <ArrowUpCircle size={15} /> },
  { label: "Notifications", href: "/portal/notifications", icon: <Bell size={15} /> },
];

interface Props {
  customerName: string;
  planName: string;
  status: string;
}

export function PortalSidebar({ customerName, planName, status }: Props) {
  const pathname = usePathname();

  return (
    <aside className="w-52 min-w-[208px] bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white text-sm font-bold">FC</div>
          <div>
            <div className="text-sm font-semibold text-gray-900">FiberCRM</div>
            <div className="text-xs text-gray-400">Customer portal</div>
          </div>
        </div>
      </div>

      {/* Customer pill */}
      <div className="mx-3 my-3 p-3 bg-brand-light rounded-xl">
        <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-semibold mb-2">
          {customerName.slice(0, 2).toUpperCase()}
        </div>
        <div className="text-xs font-semibold text-gray-900 truncate">{customerName}</div>
        <div className="text-xs text-brand-600 truncate">{planName}</div>
        <div className={cn(
          "text-[10px] mt-1 font-medium",
          status === "active" ? "text-green-600" : "text-red-500"
        )}>
          {status}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2">
        {NAV.map(item => {
          const active = item.href === "/portal"
            ? pathname === "/portal"
            : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={cn("nav-item", active && "nav-item-active")}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
