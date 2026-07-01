"use client";
// ─── Register Page ────────────────────────────────────────────────────────────
// Self-service signup for new customers.
// After signup: Supabase trigger creates auth user → users table auto-populated.

import { useState } from "react";
import { useRouter }  from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import Link from "next/link";

export default function RegisterPage() {
  const router   = useRouter();
  const supabase = createBrowserClient();

  const [form, setForm] = useState({
    name:     "",
    email:    "",
    phone:    "",
    password: "",
    confirm:  "",
    area:     "",
  });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    // Create auth user
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email:    form.email,
      password: form.password,
      options: {
        data: {
          name:  form.name,
          phone: form.phone,
          role:  "customer",
        },
      },
    });

    if (authErr) {
      setError(authErr.message);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      setError("Registration failed — please try again.");
      setLoading(false);
      return;
    }

    // Create customer record (the DB trigger creates the users row,
    // but we also need a customers row for the portal to work)
    const { error: custErr } = await supabase.from("customers").insert({
      id:     authData.user.id,
      name:   form.name,
      email:  form.email,
      phone:  form.phone,
      type:   "home",
      status: "active",
    });

    if (custErr) {
      console.error("Customer record creation failed:", custErr);
      // Don't block — let them log in and staff can fix the record
    }

    router.push("/portal");
  }

  const NAIROBI_AREAS = [
    "Kilimani", "Westlands", "Karen", "Lavington", "Parklands",
    "Kilimani", "Ruaka", "Kasarani", "Upperhill", "CBD",
    "Kiambu", "Ruiru", "Thika",
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500 text-white text-xl font-bold mb-3">OC</div>
          <h1 className="text-xl font-semibold text-gray-900">Create account</h1>
          <p className="text-sm text-gray-500 mt-1">Sign up for OpsCentre internet</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full name</label>
              <input className="input" placeholder="John Kariuki" value={form.name} onChange={set("name")} required />
            </div>

            <div>
              <label className="label">Email address</label>
              <input type="email" className="input" placeholder="john@email.com" value={form.email} onChange={set("email")} required autoComplete="email" />
            </div>

            <div>
              <label className="label">Phone number</label>
              <input type="tel" className="input" placeholder="0712 345 678" value={form.phone} onChange={set("phone")} required />
            </div>

            <div>
              <label className="label">Area / location</label>
              <select className="input" value={form.area} onChange={set("area")} required>
                <option value="">Select your area…</option>
                {NAIROBI_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Password</label>
              <input type="password" className="input" placeholder="Min 8 characters" value={form.password} onChange={set("password")} required autoComplete="new-password" />
            </div>

            <div>
              <label className="label">Confirm password</label>
              <input type="password" className="input" placeholder="Repeat password" value={form.confirm} onChange={set("confirm")} required />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </button>

            <p className="text-xs text-gray-400 text-center">
              By signing up you agree to our terms of service.
            </p>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-brand-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
