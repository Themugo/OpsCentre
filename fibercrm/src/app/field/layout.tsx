// ─── Field App Layout ─────────────────────────────────────────────────────────
// Mobile-first PWA shell for field technicians.
// Guards: must be authenticated + role === 'tech' (or admin)

import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase";
import { FieldBottomNav } from "@/components/field/FieldBottomNav";

export const metadata = {
  title: "FiberCRM Field",
  manifest: "/field-manifest.json",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
  themeColor: "#1D9E75",
};

export default async function FieldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login?next=/field");

  const { data: user } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("id", session.user.id)
    .single();

  if (!user || !["tech", "admin"].includes(user.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 max-w-md mx-auto">
      {/* Status bar spacer */}
      <div className="h-safe-top bg-white" />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom navigation */}
      <FieldBottomNav techName={user.name} />
    </div>
  );
}
