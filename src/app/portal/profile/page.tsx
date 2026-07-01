"use client";
// ─── Portal Profile Page ──────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import { PageSpinner } from "@/components/ui";
import { CheckCircle2, Edit3 } from "lucide-react";

interface NotifPref {
  invoice_reminders: boolean;
  payment_receipts:  boolean;
  outage_alerts:     boolean;
  ticket_updates:    boolean;
  promotions:        boolean;
}

export default function PortalProfilePage() {
  const supabase = createBrowserClient();
  const qc       = useQueryClient();

  const [editing, setEditing]   = useState(false);
  const [saved, setSaved]       = useState(false);
  const [form, setForm]         = useState({ name: "", phone: "" });
  const [prefs, setPrefs]       = useState<NotifPref>({
    invoice_reminders: true,
    payment_receipts:  true,
    outage_alerts:     true,
    ticket_updates:    true,
    promotions:        false,
  });

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn:  () => supabase.auth.getSession().then(r => r.data.session),
  });

  const { data: customer, isLoading } = useQuery({
    queryKey: ["portal-profile"],
    enabled:  !!session,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(`id, name, email, phone, type, status, created_at,
          addresses(street, area, county)`)
        .eq("id", session!.user.id)
        .single();
      if (error) throw error;
      setForm({ name: data.name, phone: data.phone ?? "" });
      return data;
    },
  });

  const updateProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("customers")
        .update({ name: form.name, phone: form.phone })
        .eq("id", session!.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-profile"] });
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const changePassword = async () => {
    if (!customer?.email) return;
    await supabase.auth.resetPasswordForEmail(customer.email, {
      redirectTo: `${window.location.origin}/portal/profile`,
    });
    alert("Password reset email sent!");
  };

  if (isLoading) return <PageSpinner />;

  const addr = customer?.addresses as any;

  return (
    <div className="space-y-5 max-w-lg">
      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <CheckCircle2 size={16} /> Profile updated successfully
        </div>
      )}

      {/* Personal details */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Personal details</h2>
          <button
            onClick={() => editing ? updateProfile.mutate() : setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-brand-600 hover:underline font-medium"
          >
            {editing ? (updateProfile.isPending ? "Saving…" : "Save changes") : <><Edit3 size={12} /> Edit</>}
          </button>
        </div>

        <div className="divide-y divide-gray-50">
          {/* Name */}
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-gray-500">Full name</span>
            {editing ? (
              <input
                className="text-sm font-medium text-right border-b border-brand-400 outline-none bg-transparent w-48"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            ) : (
              <span className="text-sm font-medium text-gray-900">{customer?.name}</span>
            )}
          </div>

          {/* Phone */}
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-gray-500">Phone</span>
            {editing ? (
              <input
                className="text-sm font-medium text-right border-b border-brand-400 outline-none bg-transparent w-48"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            ) : (
              <span className="text-sm font-medium text-gray-900">{customer?.phone ?? "—"}</span>
            )}
          </div>

          {/* Email — read only */}
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-gray-500">Email</span>
            <span className="text-sm font-medium text-gray-900">{customer?.email}</span>
          </div>

          {/* Account type */}
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-gray-500">Account type</span>
            <span className="text-sm font-medium text-gray-900 capitalize">{customer?.type}</span>
          </div>

          {/* Address */}
          {addr && (
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-gray-500">Address</span>
              <span className="text-sm font-medium text-gray-900 text-right max-w-[220px]">
                {[addr.street, addr.area, addr.county].filter(Boolean).join(", ")}
              </span>
            </div>
          )}

          {/* Member since */}
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-gray-500">Member since</span>
            <span className="text-sm font-medium text-gray-900">
              {customer?.created_at ? formatDate(customer.created_at) : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Notification preferences */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Notification preferences</h2>
          <p className="text-xs text-gray-400 mt-0.5">Choose what alerts you receive via SMS and email</p>
        </div>
        <div className="divide-y divide-gray-50">
          {(Object.entries({
            invoice_reminders: "Invoice reminders",
            payment_receipts:  "Payment receipts",
            outage_alerts:     "Outage & maintenance alerts",
            ticket_updates:    "Support ticket updates",
            promotions:        "Promotional offers",
          }) as [keyof NotifPref, string][]).map(([key, label]) => (
            <div key={key} className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-gray-700">{label}</span>
              <button
                onClick={() => setPrefs(p => ({ ...p, [key]: !p[key] }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  prefs[key] ? "bg-brand-500" : "bg-gray-200"
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  prefs[key] ? "translate-x-4" : "translate-x-1"
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Security */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Security</h2>
        </div>
        <div className="divide-y divide-gray-50">
          <div className="flex justify-between items-center px-4 py-3">
            <div>
              <div className="text-sm text-gray-700">Password</div>
              <div className="text-xs text-gray-400 mt-0.5">Last changed recently</div>
            </div>
            <button
              onClick={changePassword}
              className="text-xs text-brand-600 font-medium hover:underline"
            >
              Change
            </button>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <div>
              <div className="text-sm text-gray-700">Two-factor authentication</div>
              <div className="text-xs text-gray-400 mt-0.5">Add an extra layer of security</div>
            </div>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Disabled</span>
          </div>
        </div>
      </div>
    </div>
  );
}
