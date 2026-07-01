"use client";
// ─── Service Plans Page ───────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatKES } from "@/lib/utils";
import { Badge, PageSpinner, Modal, StatCard } from "@/components/ui";
import { Plus, Zap, Building2, Home, Edit2, Trash2, AlertTriangle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

interface Plan {
  id:              string;
  name:            string;
  type:            "home" | "business" | "estate";
  speed_down_mbps: number;
  speed_up_mbps:   number;
  price_kes:       number;
  billing_cycle:   string;
  is_active:       boolean;
  subscriber_count?: number;
}

const PlanSchema = z.object({
  name:            z.string().min(2, "Name required"),
  type:            z.enum(["home","business","estate"]),
  speed_down_mbps: z.coerce.number().int().positive("Must be positive"),
  speed_up_mbps:   z.coerce.number().int().positive("Must be positive"),
  price_kes:       z.coerce.number().positive("Must be positive"),
  billing_cycle:   z.enum(["monthly","quarterly","annual"]),
  is_active:       z.boolean().default(true),
});
type PlanForm = z.infer<typeof PlanSchema>;

const TYPE_ICON = { home: Home, business: Building2, estate: Building2 };
const TYPE_COLOR: Record<string, string> = {
  home:     "bg-blue-50 text-blue-700 border-blue-200",
  business: "bg-amber-50 text-amber-700 border-amber-200",
  estate:   "bg-purple-50 text-purple-700 border-purple-200",
};

export default function PlansPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing,   setEditing]   = useState<Plan | null>(null);
  const [deleting,  setDeleting]  = useState<Plan | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PlanForm>({
    resolver: zodResolver(PlanSchema),
  });

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: plans, isLoading } = useQuery({
    queryKey: ["plans-all"],
    queryFn: async () => {
      const res = await fetch("/api/plans?all=true");
      const d   = await res.json();
      return d.data as Plan[];
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const savePlan = useMutation({
    mutationFn: async (data: PlanForm) => {
      const url    = editing ? `/api/plans?id=${editing.id}` : "/api/plans";
      const method = editing ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans-all"] });
      setShowModal(false);
      setEditing(null);
      reset();
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await fetch(`/api/plans?id=${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !is_active }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans-all"] }),
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/plans?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans-all"] });
      setDeleting(null);
      setDeleteError("");
    },
    onError: (e: any) => setDeleteError(e.message),
  });

  function openCreate() {
    setEditing(null);
    reset({ type: "home", billing_cycle: "monthly", is_active: true });
    setShowModal(true);
  }

  function openEdit(plan: Plan) {
    setEditing(plan);
    reset(plan);
    setShowModal(true);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const active   = plans?.filter(p => p.is_active).length ?? 0;
  const inactive = plans?.filter(p => !p.is_active).length ?? 0;
  const totalSubs = plans?.reduce((s, p) => s + (p.subscriber_count ?? 0), 0) ?? 0;

  const byType = (type: string) => plans?.filter(p => p.type === type) ?? [];

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Active plans"      value={active}    changeUp />
        <StatCard label="Inactive plans"    value={inactive}  />
        <StatCard label="Total subscribers" value={totalSubs} changeUp />
        <StatCard label="Plan types"        value={3}         />
      </div>

      <div className="flex justify-end">
        <button className="btn-primary flex items-center gap-2" onClick={openCreate}>
          <Plus size={14} /> New plan
        </button>
      </div>

      {isLoading ? <PageSpinner /> : (
        (["home","business","estate"] as const).map(type => {
          const typePlans = byType(type);
          if (!typePlans.length) return null;
          const Icon = TYPE_ICON[type];
          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`p-1.5 rounded-lg border ${TYPE_COLOR[type]}`}>
                  <Icon size={14} />
                </div>
                <h2 className="text-sm font-semibold text-gray-900 capitalize">{type} plans</h2>
                <span className="text-xs text-gray-400">({typePlans.length})</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {typePlans.map(plan => (
                  <div key={plan.id}
                    className={`bg-white rounded-xl border p-5 relative ${
                      plan.is_active ? "border-gray-200" : "border-gray-100 opacity-60"
                    }`}>
                    {!plan.is_active && (
                      <span className="absolute top-3 right-3 text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                        Inactive
                      </span>
                    )}

                    <div className="mb-3">
                      <div className="text-sm font-semibold text-gray-900">{plan.name}</div>
                      <div className="text-2xl font-bold text-gray-900 mt-1">
                        {formatKES(plan.price_kes)}
                        <span className="text-sm font-normal text-gray-400">
                          /{plan.billing_cycle === "monthly" ? "mo" : plan.billing_cycle === "quarterly" ? "qtr" : "yr"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-sm text-gray-600 mb-4">
                      <div className="flex items-center gap-1.5">
                        <Zap size={12} className="text-brand-500" />
                        {plan.speed_down_mbps}↓ / {plan.speed_up_mbps}↑ Mbps
                      </div>
                      <div className="text-xs text-gray-400">
                        {plan.subscriber_count ?? 0} active subscriber{plan.subscriber_count !== 1 ? "s" : ""}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(plan)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                        <Edit2 size={11} /> Edit
                      </button>
                      <button
                        onClick={() => toggleActive.mutate({ id: plan.id, is_active: plan.is_active })}
                        className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${
                          plan.is_active
                            ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                            : "border-green-200 text-green-700 hover:bg-green-50"
                        }`}>
                        {plan.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => { setDeleting(plan); setDeleteError(""); }}
                        className="p-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null); reset(); }}
        title={editing ? `Edit: ${editing.name}` : "New service plan"}>
        <form onSubmit={handleSubmit(d => savePlan.mutate(d))} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Plan name</label>
              <input className="input" placeholder="e.g. Home Plus" {...register("name")} />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" {...register("type")}>
                <option value="home">Home</option>
                <option value="business">Business</option>
                <option value="estate">Estate</option>
              </select>
            </div>
            <div>
              <label className="label">Billing cycle</label>
              <select className="input" {...register("billing_cycle")}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div>
              <label className="label">Download speed (Mbps)</label>
              <input type="number" className="input" {...register("speed_down_mbps")} />
              {errors.speed_down_mbps && <p className="text-xs text-red-500 mt-1">{errors.speed_down_mbps.message}</p>}
            </div>
            <div>
              <label className="label">Upload speed (Mbps)</label>
              <input type="number" className="input" {...register("speed_up_mbps")} />
              {errors.speed_up_mbps && <p className="text-xs text-red-500 mt-1">{errors.speed_up_mbps.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="label">Price (KES)</label>
              <input type="number" className="input" placeholder="3500" {...register("price_kes")} />
              {errors.price_kes && <p className="text-xs text-red-500 mt-1">{errors.price_kes.message}</p>}
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="is_active" {...register("is_active")}
                className="w-4 h-4 rounded border-gray-300 text-brand-500" />
              <label htmlFor="is_active" className="text-sm text-gray-700">Active (visible to customers)</label>
            </div>
          </div>

          {savePlan.error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {(savePlan.error as any).message}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" className="btn-secondary flex-1"
              onClick={() => { setShowModal(false); setEditing(null); reset(); }}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1 justify-center"
              disabled={savePlan.isPending}>
              {savePlan.isPending ? "Saving…" : editing ? "Save changes" : "Create plan"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!deleting}
        onClose={() => { setDeleting(null); setDeleteError(""); }}
        title="Delete plan"
        width="max-w-sm">
        {deleting && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">
                Delete <strong>{deleting.name}</strong>? This cannot be undone.
                Plans with active subscribers cannot be deleted.
              </p>
            </div>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{deleteError}</p>
            )}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1"
                onClick={() => { setDeleting(null); setDeleteError(""); }}>
                Cancel
              </button>
              <button className="btn-danger flex-1 justify-center"
                onClick={() => deletePlan.mutate(deleting.id)}
                disabled={deletePlan.isPending}>
                {deletePlan.isPending ? "Deleting…" : "Delete plan"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
