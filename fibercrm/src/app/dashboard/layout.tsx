// ─── Dashboard Layout ─────────────────────────────────────────────────────────
// Shared layout for all /dashboard/* pages.
// Server component — fetches session and passes role to sidebar.

import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase";
import { Sidebar } from "@/components/ui/Sidebar";
import { Topbar } from "@/components/ui/Topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id, name, role, email")
    .eq("id", session.user.id)
    .single();

  if (!profile) redirect("/login");

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar role={profile.role} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar user={profile} />
        <main className="flex-1 overflow-y-auto p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
