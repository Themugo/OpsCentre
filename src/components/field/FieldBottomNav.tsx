"use client";
// ─── Field Bottom Navigation ──────────────────────────────────────────────────

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Clock, User, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Jobs",    href: "/field",         icon: Briefcase },
  { label: "History", href: "/field/history", icon: Clock },
  { label: "Profile", href: "/field/profile", icon: User },
  { label: "Help",    href: "/field/help",    icon: HelpCircle },
];

export function FieldBottomNav({ techName }: { techName: string }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-200 grid grid-cols-4 pb-safe">
      {TABS.map(({ label, href, icon: Icon }) => {
        const active = href === "/field" ? pathname === "/field" : pathname.startsWith(href);
        return (
          <Link key={href} href={href}
            className="flex flex-col items-center gap-1 py-2.5 px-1 transition-colors">
            <Icon size={20} className={cn(active ? "text-brand-600" : "text-gray-400")} />
            <span className={cn("text-[10px] font-medium", active ? "text-brand-600" : "text-gray-400")}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
