"use client";
// ─── Forgot Password Page ─────────────────────────────────────────────────────

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const supabase            = createBrowserClient();
  const [email, setEmail]   = useState("");
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500 text-white text-xl font-bold mb-3">FC</div>
          <h1 className="text-xl font-semibold text-gray-900">Reset password</h1>
          <p className="text-sm text-gray-500 mt-1">Enter your email to receive a reset link</p>
        </div>

        <div className="card">
          {sent ? (
            <div className="text-center space-y-3 py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl mx-auto">✓</div>
              <p className="text-sm font-medium text-gray-900">Check your email</p>
              <p className="text-xs text-gray-500">We sent a password reset link to <strong>{email}</strong></p>
              <Link href="/login" className="text-sm text-brand-600 hover:underline block mt-2">
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Email address</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@fiberco.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </button>

              <div className="text-center">
                <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
