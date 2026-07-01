"use client";
// ─── Portal Upgrade Page ──────────────────────────────────────────────────────
// Shows all available plans. Customer can upgrade via the subscriptions API
// which calculates proration and issues a new invoice automatically.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatKES } from "@/lib/utils";
import { PageSpinner, Modal } from "@/components/ui";
import { Zap, CheckCircle2, ArrowRight, Building2, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface Plan {
  id:              string;
  name:            string;
  type:            string;
  speed_down_mbps: number;
  speed_up_mbps:   number;
  price_kes:       number;
  billing_cycle:   string;
}

export default function PortalUpgradePage() {
  const supabase = createBrowserClient();
  const qc = useQueryClient();

  const [selected,   setSelected]   = useState<Plan | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Get current session
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn:  () => supabase.auth.getSession().then(r => r.data.session),
  });

  // Get current subscription
  const { data: currentSub } = useQuery({
    queryKey: ["my-subscription"],
    enabled:  !!session,
    queryFn:  async () => {
      const res  = await fetch(`/api/customers/${session!.user.id}/subscriptions`);
      const data = await res.json();
      const subs = data.data ?? [];
      return subs.find((s: any) => s.status === "active") ?? null;
    },
  });

  // Get all available plans
  const { data: plans, isLoading } = useQuery({
    queryKey: ["portal-plans"],
    queryFn:  async () => {
      const res  = await fetch("/api/onboarding/plans");
      const data = await res.json();
      return (data.data ?? []) as Plan[];
    },
  });

  const currentPlan = currentSub?.service_plans as any;

  // Upgrade mutation
  const upgrade = useMutation({
    mutationFn: async (newPlanId: string) => {
      const res = await fetch("/api/subscriptions", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:         "upgrade",
          subscriptionId: currentSub?.id,
          newPlanId,
          prorate:        true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upgrade failed");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
      qc.invalidateQueries({ queryKey: ["portal-invoices"] });
      setConfirming(false);
      setSelected(null);
    },
  });

  const isCurrentPlan  = (plan: Plan) => plan.id === currentSub?.plan_id;
  const isUpgrade      = (plan: Plan) => currentPlan && plan.price_kes > currentPlan.price_kes;
  const isDowngrade    = (plan: Plan) => currentPlan && plan.price_kes < currentPlan.price_kes;

  // Pro-rate estimate
  const proRateEstimate = selected && currentPlan
    ? Math.max(0, selected.price_kes - currentPlan.price_kes)
    : 0;

  if (isLoading) return <PageSpinner />;

  const byType = (type: string) => (plans ?? []).filter(p => p.type === type);

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Current plan banner */}
      {currentPlan && (
        <div className="bg-brand-light border border-brand-300 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-brand-700">Your current plan</div>
            <div className="text-base font-bold text-brand-900">{currentPlan.name}</div>
            <div className="text-xs text-brand-600 mt-0.5">
              {currentPlan.speed_down_mbps}↓ / {currentPlan.speed_up_mbps}↑ Mbps ·{" "}
              {formatKES(currentPlan.price_kes)}/mo
            </div>
          </div>
          <CheckCircle2 size={28} className="text-brand-500" />
        </div>
      )}

      {/* Plans by type */}
      {(["home","business"] as const).map(type => {
        const typePlans = byType(type);
        if (!typePlans.length) return null;
        const TypeIcon = type === "business" ? Building2 : Home;

        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-3">
              <TypeIcon size={15} className="text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-700 capitalize">{type} plans</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {typePlans.map(plan => {
                const isCurrent  = isCurrentPlan(plan);
                const isUp       = isUpgrade(plan);
                const isDown     = isDowngrade(plan);

                return (
                  <div key={plan.id}
                    className={cn(
                      "bg-white rounded-2xl border-2 p-5 transition-all",
                      isCurrent
                        ? "border-brand-500 shadow-md shadow-brand-100"
                        : isUp
                        ? "border-gray-200 hover:border-brand-300 hover:shadow-sm cursor-pointer"
                        : "border-gray-100 opacity-60"
                    )}
                    onClick={() => {
                      if (!isCurrent && isUp) {
                        setSelected(plan);
                        setConfirming(true);
                      }
                    }}
                  >
                    {isCurrent && (
                      <div className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-2">
                        Current plan
                      </div>
                    )}
                    {isUp && !isCurrent && (
                      <div className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <ArrowRight size={10} /> Upgrade
                      </div>
                    )}

                    <div className="text-sm font-semibold text-gray-900">{plan.name}</div>

                    <div className="text-2xl font-bold text-gray-900 mt-1">
                      {formatKES(plan.price_kes)}
                      <span className="text-sm font-normal text-gray-400">/mo</span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-2">
                      <Zap size={11} className="text-brand-500" />
                      {plan.speed_down_mbps}↓ / {plan.speed_up_mbps}↑ Mbps
                    </div>

                    <div className="mt-4 space-y-1">
                      {["Unlimited data","Free router","24/7 support",
                        plan.type === "business" ? "SLA guarantee" : "1 static IP",
                      ].map(f => (
                        <div key={f} className="text-xs text-gray-500 flex items-center gap-1.5">
                          <span className="text-brand-500">✓</span> {f}
                        </div>
                      ))}
                    </div>

                    <div className="mt-4">
                      {isCurrent ? (
                        <div className="text-center text-xs text-brand-600 font-medium py-2">
                          ✓ Active
                        </div>
                      ) : isUp ? (
                        <button
                          className="btn-primary w-full justify-center text-sm py-2"
                          onClick={e => { e.stopPropagation(); setSelected(plan); setConfirming(true); }}
                        >
                          Upgrade →
                        </button>
                      ) : (
                        <div className="text-center text-xs text-gray-400 py-2">
                          {isDown ? "Downgrade — call support" : "Not available"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="text-xs text-gray-400">
        Upgrades take effect immediately. You'll be charged a prorated amount for the
        remainder of your current billing cycle via M-Pesa. Call{" "}
        <strong>0800 000 000</strong> to downgrade or for estate plan pricing.
      </p>

      {/* Upgrade confirmation modal */}
      <Modal
        open={confirming && !!selected}
        onClose={() => { setConfirming(false); setSelected(null); }}
        title="Confirm upgrade"
        width="max-w-sm"
      >
        {selected && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">From</span>
                <span className="font-medium">{currentPlan?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">To</span>
                <span className="font-semibold text-brand-700">{selected.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">New monthly fee</span>
                <span className="font-semibold">{formatKES(selected.price_kes)}/mo</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="text-gray-500">Charged today (prorated)</span>
                <span className="font-bold text-gray-900">{formatKES(proRateEstimate)}</span>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              You'll receive an M-Pesa prompt for the prorated amount. Your new speeds
              activate immediately after payment.
            </p>

            {upgrade.isError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                {(upgrade.error as Error)?.message}
              </p>
            )}

            <div className="flex gap-3">
              <button className="btn-secondary flex-1"
                onClick={() => { setConfirming(false); setSelected(null); }}>
                Cancel
              </button>
              <button
                className="btn-primary flex-1 justify-center"
                onClick={() => upgrade.mutate(selected.id)}
                disabled={upgrade.isPending}
              >
                {upgrade.isPending ? "Upgrading…" : "Confirm upgrade"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
