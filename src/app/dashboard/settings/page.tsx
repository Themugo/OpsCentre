"use client";
// ─── Settings Page ────────────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatDate, initials } from "@/lib/utils";
import { Badge, Table, Modal, PageSpinner } from "@/components/ui";
import { Plus, Shield } from "lucide-react";

interface StaffUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

const ROLE_BADGE: Record<string, "danger"|"warning"|"info"|"success"|"gray"> = {
  admin: "danger", billing: "warning", sales: "info", support: "success", tech: "gray",
};

export default function SettingsPage() {
  const supabase = createBrowserClient();
  const qc = useQueryClient();
  const [tab, setTab]         = useState<"users"|"audit">("users");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]       = useState({ name: "", email: "", role: "support", phone: "" });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const { data: users, isLoading } = useQuery({
    queryKey: ["staff-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, phone, role, is_active, created_at")
        .neq("role", "customer")
        .order("role").order("name");
      if (error) throw error;
      return data as StaffUser[];
    },
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["audit-logs"],
    enabled: tab === "audit",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, table_name, record_id, created_at, users(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const toggleUser = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("users").update({ is_active: !is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-users"] }),
  });

  async function handleAddUser() {
    setError(""); setSaving(true);
    try {
      const { error: authErr } = await supabase.auth.admin.createUser({
        email:      form.email,
        password:   Math.random().toString(36).slice(-10),
        user_metadata: { name: form.name, role: form.role },
        email_confirm: true,
      });
      if (authErr) throw authErr;
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      setShowAdd(false);
      setForm({ name: "", email: "", role: "support", phone: "" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const userColumns = [
    {
      key: "name",
      header: "User",
      render: (u: StaffUser) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-xs font-semibold text-brand-600">
            {initials(u.name)}
          </div>
          <div>
            <div className="font-medium text-gray-900 text-sm">{u.name}</div>
            <div className="text-xs text-gray-400">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (u: StaffUser) => <Badge variant={ROLE_BADGE[u.role] ?? "gray"}>{u.role}</Badge>,
    },
    {
      key: "phone",
      header: "Phone",
      render: (u: StaffUser) => <span className="text-sm text-gray-600">{u.phone ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (u: StaffUser) => (
        <Badge variant={u.is_active ? "success" : "gray"}>{u.is_active ? "Active" : "Inactive"}</Badge>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      render: (u: StaffUser) => <span className="text-xs text-gray-400">{formatDate(u.created_at)}</span>,
    },
    {
      key: "action",
      header: "",
      render: (u: StaffUser) => (
        <button
          className={`text-xs px-2 py-1 rounded border ${u.is_active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
          onClick={e => { e.stopPropagation(); toggleUser.mutate({ id: u.id, is_active: u.is_active }); }}>
          {u.is_active ? "Deactivate" : "Activate"}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["users","audit"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px transition-colors ${tab === t ? "border-gray-900 text-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t === "audit" ? "Audit log" : "Staff users"}
          </button>
        ))}
      </div>

      {tab === "users" ? (
        <>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Shield size={14} />
              <span>{users?.filter(u => u.is_active).length ?? 0} active staff members</span>
            </div>
            <button className="btn-primary" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Add staff user
            </button>
          </div>
          <div className="card p-0 overflow-hidden">
            {isLoading ? <PageSpinner /> : (
              <Table columns={userColumns} data={users ?? []} emptyMessage="No staff users found" />
            )}
          </div>
        </>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["When","User","Action","Table","Record"].map(h => (
                  <th key={h} className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(auditLogs ?? []).map((log: any) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 px-3 text-xs text-gray-400">{formatDate(log.created_at)}</td>
                  <td className="py-2.5 px-3 text-gray-700">{log.users?.name ?? "System"}</td>
                  <td className="py-2.5 px-3">
                    <Badge variant={log.action === "DELETE" ? "danger" : log.action === "UPDATE" ? "warning" : "success"}>
                      {log.action}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-xs text-gray-600">{log.table_name}</td>
                  <td className="py-2.5 px-3 font-mono text-xs text-gray-400 truncate max-w-[140px]">{log.record_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add staff user" width="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="label">Full name</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Email address</label>
            <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Phone (optional)</label>
            <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="admin">Admin</option>
              <option value="billing">Billing</option>
              <option value="sales">Sales</option>
              <option value="support">Support</option>
              <option value="tech">Field Technician</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <p className="text-xs text-gray-400">A password reset email will be sent to the user.</p>
          <div className="flex gap-3 pt-1">
            <button className="btn-secondary flex-1" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn-primary flex-1 justify-center" onClick={handleAddUser} disabled={saving}>
              {saving ? "Creating…" : "Create user"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
