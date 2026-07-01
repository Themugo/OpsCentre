"use client";
// ─── Customers Page ───────────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatDate, invoiceStatusClass, initials, cn } from "@/lib/utils";
import { Badge, Table, EmptyState, PageSpinner, Modal } from "@/components/ui";
import { Search, Plus, Filter } from "lucide-react";

type CustomerType = "home" | "business" | "estate";
type CustomerStatus = "active" | "suspended" | "churned";

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: CustomerType;
  status: CustomerStatus;
  created_at: string;
  addresses: { area: string } | null;
  subscriptions: { service_plans: { name: string } | null }[];
}

export default function CustomersPage() {
  const supabase = createBrowserClient();
  const qc = useQueryClient();
  const [search, setSearch]   = useState("");
  const [typeFilter, setType] = useState<CustomerType | "all">("all");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState({ name: "", email: "", phone: "", type: "home" as const, street: "", area: "" });
  const [addErr,  setAddErr]      = useState("");
  const [adding,  setAdding]      = useState(false);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", typeFilter],
    queryFn: async () => {
      let q = supabase
        .from("customers")
        .select(`id, name, email, phone, type, status, created_at,
          addresses(area),
          subscriptions(service_plans(name))`)
        .order("created_at", { ascending: false });
      if (typeFilter !== "all") q = q.eq("type", typeFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as Customer[];
    },
  });

  const filtered = customers?.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  ) ?? [];

  async function handleAddCustomer() {
    if (!addForm.name || !addForm.phone) { setAddErr("Name and phone are required"); return; }
    setAdding(true); setAddErr("");
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name, email: addForm.email || undefined,
          phone: addForm.phone, type: addForm.type,
          address: addForm.street ? { street: addForm.street, area: addForm.area || addForm.name, county: "Nairobi" } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      qc.invalidateQueries({ queryKey: ["customers"] });
      setShowAdd(false);
      setAddForm({ name: "", email: "", phone: "", type: "home", street: "", area: "" });
    } catch (e: any) { setAddErr(e.message); }
    finally { setAdding(false); }
  }

  const columns = [
    {
      key: "name",
      header: "Customer",
      render: (c: Customer) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-xs font-semibold text-brand-600 flex-shrink-0">
            {initials(c.name)}
          </div>
          <div>
            <div className="font-medium text-gray-900">{c.name}</div>
            <div className="text-xs text-gray-400">{c.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      render: (c: Customer) => (
        <span className="text-sm text-gray-700">
          {c.subscriptions?.[0]?.service_plans?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (c: Customer) => (
        <Badge variant={c.type === "business" ? "warning" : c.type === "estate" ? "info" : "gray"}>
          {c.type}
        </Badge>
      ),
    },
    {
      key: "area",
      header: "Area",
      render: (c: Customer) => (
        <span className="text-sm text-gray-600">{c.addresses?.area ?? "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c: Customer) => (
        <Badge variant={c.status === "active" ? "success" : c.status === "suspended" ? "warning" : "danger"}>
          {c.status}
        </Badge>
      ),
    },
    {
      key: "since",
      header: "Since",
      render: (c: Customer) => (
        <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8"
            placeholder="Search by name, email, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input w-auto text-sm"
            value={typeFilter}
            onChange={(e) => setType(e.target.value as CustomerType | "all")}
          >
            <option value="all">All types</option>
            <option value="home">Home</option>
            <option value="business">Business</option>
            <option value="estate">Estate</option>
          </select>
          <button className="btn-primary">
            <Plus size={14} /> Add customer
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {(["home","business","estate"] as const).map((t) => (
          <div key={t} className="bg-gray-50 rounded-xl px-4 py-3 cursor-pointer hover:bg-brand-light transition-colors" onClick={() => setType(t)}>
            <div className="text-xs text-gray-500 capitalize">{t}</div>
            <div className="text-lg font-semibold">{customers?.filter(c=>c.type===t).length ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <PageSpinner />
        ) : (
          <Table
            columns={columns}
            data={filtered}
            onRowClick={setSelected}
            emptyMessage="No customers found"
          />
        )}
      </div>

      {/* Add customer modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setAddErr(""); }} title="Add new customer" width="max-w-md">
        <div className="space-y-3">
          <div><label className="label">Full name *</label>
            <input className="input" placeholder="John Kariuki" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="label">Phone *</label>
            <input className="input" placeholder="0712 345 678" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className="label">Email</label>
            <input type="email" className="input" placeholder="john@email.com" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div><label className="label">Customer type</label>
            <select className="input" value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value as any }))}>
              <option value="home">Home</option><option value="business">Business</option><option value="estate">Estate</option>
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Street / building</label>
              <input className="input" placeholder="Apt 4B, Kilimani Rd" value={addForm.street} onChange={e => setAddForm(f => ({ ...f, street: e.target.value }))} /></div>
            <div><label className="label">Area</label>
              <input className="input" placeholder="Westlands" value={addForm.area} onChange={e => setAddForm(f => ({ ...f, area: e.target.value }))} /></div>
          </div>
          {addErr && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{addErr}</p>}
          <div className="flex gap-3 pt-1">
            <button className="btn-secondary flex-1" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn-primary flex-1 justify-center" onClick={handleAddCustomer} disabled={adding}>
              {adding ? "Adding…" : "Add customer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Customer detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
      >
        {selected && (
          <div className="space-y-3 text-sm">
            {[
              ["Email", selected.email],
              ["Phone", selected.phone],
              ["Type", selected.type],
              ["Status", selected.status],
              ["Area", selected.addresses?.area ?? "—"],
              ["Plan", selected.subscriptions?.[0]?.service_plans?.name ?? "—"],
              ["Customer since", formatDate(selected.created_at)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-gray-900 capitalize">{value}</span>
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <a href={`/dashboard/invoices?customer=${selected.id}`} className="btn-secondary flex-1 justify-center">View invoices</a>
              <a href={`/dashboard/tickets?customer=${selected.id}`} className="btn-primary flex-1 justify-center">View tickets</a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
