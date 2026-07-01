// ─── Customer Portal Layout ───────────────────────────────────────────────────
// Shared layout for all /portal/* pages.
// Guards: must be authenticated + role === 'customer'

import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase";
import { PortalSidebar } from "@/components/portal/PortalSidebar";
import { PortalTopbar } from "@/components/portal/PortalTopbar";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login?next=/portal");

  // Fetch customer record linked to this auth user
  const { data: customer } = await supabase
    .from("customers")
    .select(`
      id, name, email, phone, status,
      subscriptions(
        id, status, next_billing_date,
        service_plans(name, speed_down_mbps, speed_up_mbps, price_kes)
      )
    `)
    .eq("id", session.user.id)
    .single();

  // If not a customer record, redirect to staff dashboard
  if (!customer) redirect("/dashboard");

  const activeSub   = customer.subscriptions?.find((s: any) => s.status === "active");
  const planName    = activeSub?.service_plans?.name ?? "No active plan";
  const nextBilling = activeSub?.next_billing_date;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <PortalSidebar
        customerName={customer.name}
        planName={planName}
        status={customer.status}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <PortalTopbar
          customerName={customer.name}
          nextBilling={nextBilling}
        />
        <main className="flex-1 overflow-y-auto p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
