"use client";
// ─── Reset Password Page ──────────────────────────────────────────────────────
// Supabase redirects here after the user clicks the reset link in their email.
// URL contains the access_token and refresh_token as hash fragments.

import { useState, useEffect } from "react";
import { useRouter }            from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router   = useRouter();
  const supabase = createBrowserClient();

  const [password, setPassword]   = useState("");
  const [confirm,  setConfirm]    = useState("");
  const [error,    setError]      = useState("");
  const [loading,  setLoading]    = useState(false);
  const [done,     setDone]       = useState(false);
  const [ready,    setReady]      = useState(false);

  // Supabase sends the session via URL hash fragment — exchange it first
  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setDone(true);
    setTimeout(() => router.push("/dashboard"), 2000);
  }

  if (!ready && !done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500 text-white text-xl font-bold mb-4">FC</div>
          <p className="text-sm text-gray-500">Verifying reset link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500 text-white text-xl font-bold mb-3">FC</div>
          <h1 className="text-xl font-semibold text-gray-900">Set new password</h1>
          <p className="text-sm text-gray-500 mt-1">Choose a strong password for your account</p>
        </div>

        <div className="card">
          {done ? (
            <div className="text-center space-y-3 py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-2xl mx-auto">✓</div>
              <p className="text-sm font-semibold text-gray-900">Password updated!</p>
              <p className="text-xs text-gray-500">Redirecting you to the dashboard…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">New password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Confirm new password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Repeat password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>

              {/* Password strength hints */}
              <div className="space-y-1">
                {[
                  { label: "At least 8 characters",          ok: password.length >= 8 },
                  { label: "Contains a number",               ok: /\d/.test(password) },
                  { label: "Contains uppercase + lowercase",  ok: /[A-Z]/.test(password) && /[a-z]/.test(password) },
                ].map(hint => (
                  <div key={hint.label} className="flex items-center gap-2 text-xs">
                    <span className={hint.ok ? "text-green-500" : "text-gray-300"}>
                      {hint.ok ? "✓" : "○"}
                    </span>
                    <span className={hint.ok ? "text-green-600" : "text-gray-400"}>
                      {hint.label}
                    </span>
                  </div>
                ))}
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <button
                type="submit"
                className="btn-primary w-full justify-center"
                disabled={loading || password.length < 8}
              >
                {loading ? "Updating…" : "Set new password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
