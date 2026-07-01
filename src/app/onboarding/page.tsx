"use client";
// ─── Customer Onboarding Wizard ───────────────────────────────────────────────
// 5 steps: Check coverage → Pick plan → Personal details → Account setup → Done
// Handles: coverage check, account creation, subscription activation, welcome SMS

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Wifi, MapPin, User, Lock, CheckCircle2,
  ArrowRight, ArrowLeft, Zap, Building2, Home,
} from "lucide-react";
import { cn, formatKES } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Plan {
  id:              string;
  name:            string;
  type:            "home" | "business" | "estate";
  speed_down_mbps: number;
  speed_up_mbps:   number;
  price_kes:       number;
  billing_cycle:   string;
}

interface WizardState {
  // Step 1 — Coverage
  area:          string;
  zoneId:        string | null;
  coverageOk:    boolean | null;

  // Step 2 — Plan
  plan:          Plan | null;

  // Step 3 — Personal details
  name:          string;
  phone:         string;
  email:         string;
  street:        string;
  idNumber:      string;

  // Step 4 — Account
  password:      string;
  confirm:       string;

  // Step 5 — Result
  customerId:    string | null;
  invoiceId:     string | null;
}

const INITIAL: WizardState = {
  area: "", zoneId: null, coverageOk: null,
  plan: null,
  name: "", phone: "", email: "", street: "", idNumber: "",
  password: "", confirm: "",
  customerId: null, invoiceId: null,
};

const STEPS = [
  { id: 1, label: "Coverage",  icon: <MapPin size={16} />  },
  { id: 2, label: "Plan",      icon: <Wifi size={16} />    },
  { id: 3, label: "Details",   icon: <User size={16} />    },
  { id: 4, label: "Account",   icon: <Lock size={16} />    },
  { id: 5, label: "Done",      icon: <CheckCircle2 size={16} /> },
];

const NAIROBI_AREAS = [
  "Westlands","Kilimani","Karen","Parklands","Kasarani","Ruaka",
  "Upper Hill","Lavington","Runda","Muthaiga","Kiambu","Thika Road",
  "South B","South C","Eastleigh","Kahawa","Roysambu","Githurai",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step,    setStep]    = useState(1);
  const [state,   setState]   = useState<WizardState>(INITIAL);
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const set = useCallback((updates: Partial<WizardState>) => {
    setState(s => ({ ...s, ...updates }));
  }, []);

  // ── Step 1: Check coverage ─────────────────────────────────────────────────
  async function checkCoverage() {
    if (!state.area) return;
    setLoading(true);
    setError("");
    try {
      const res  = await fetch(`/api/onboarding/coverage?area=${encodeURIComponent(state.area)}`);
      const data = await res.json();
      if (data.covered) {
        set({ coverageOk: true, zoneId: data.zoneId });
        // Fetch plans for this zone
        const pRes  = await fetch("/api/onboarding/plans");
        const pData = await pRes.json();
        setPlans(pData.data ?? []);
        setStep(2);
      } else {
        set({ coverageOk: false });
      }
    } catch {
      setError("Could not check coverage. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 4: Create account + activate ─────────────────────────────────────
  async function createAccount() {
    if (state.password !== state.confirm) {
      setError("Passwords do not match");
      return;
    }
    if (state.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/activate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:     state.name,
          email:    state.email,
          phone:    state.phone,
          password: state.password,
          planId:   state.plan?.id,
          address: {
            street: state.street,
            area:   state.area,
            county: "Nairobi",
          },
          idNumber:  state.idNumber,
          zoneId:    state.zoneId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Activation failed");
      set({ customerId: data.customerId, invoiceId: data.invoiceId });
      setStep(5);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const canNext: Record<number, boolean> = {
    1: !!state.area,
    2: !!state.plan,
    3: !!state.name && !!state.phone && !!state.email && !!state.street,
    4: !!state.password && !!state.confirm,
    5: true,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-blue-50 flex flex-col">

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold text-sm">OC</div>
          <div>
            <div className="text-sm font-semibold text-gray-900">OpsCentre</div>
            <div className="text-xs text-gray-400">Internet sign-up</div>
          </div>
        </div>
        <a href="/login" className="text-sm text-gray-500 hover:text-gray-700">
          Already a customer? Sign in →
        </a>
      </div>

      {/* Progress bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-0">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div className={cn(
                "flex items-center gap-1.5 text-xs font-medium transition-colors",
                step === s.id ? "text-brand-600" :
                step > s.id  ? "text-green-600" : "text-gray-400"
              )}>
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                  step === s.id ? "bg-brand-500 text-white" :
                  step > s.id  ? "bg-green-500 text-white" :
                  "bg-gray-100 text-gray-400"
                )}>
                  {step > s.id ? <CheckCircle2 size={12} /> : s.icon}
                </div>
                <span className="hidden sm:block">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  "flex-1 h-0.5 mx-2",
                  step > s.id ? "bg-green-400" : "bg-gray-100"
                )} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-2xl">

          {/* ── Step 1: Coverage check ─────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900 mb-2">Check if we cover your area</div>
                <p className="text-gray-500">We're expanding fast across Nairobi. Let's see if fiber is available at your location.</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
                <div>
                  <label className="label">Your area / estate</label>
                  <select className="input text-base py-3" value={state.area}
                    onChange={e => set({ area: e.target.value, coverageOk: null })}>
                    <option value="">Select your area…</option>
                    {NAIROBI_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>

                {state.coverageOk === false && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <div className="font-semibold mb-1">Not yet available in {state.area}</div>
                    <p>We're expanding rapidly. Leave your number and we'll notify you when we arrive!</p>
                    <button className="mt-3 text-amber-700 underline text-xs"
                      onClick={() => router.push("/register?notify=true")}>
                      Notify me when available →
                    </button>
                  </div>
                )}

                <button className="btn-primary w-full justify-center py-3 text-base flex items-center gap-2"
                  onClick={checkCoverage}
                  disabled={!state.area || loading}>
                  {loading ? "Checking…" : <><MapPin size={16} /> Check coverage</>}
                </button>
              </div>

              {/* Coverage map placeholder */}
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-br from-green-50 to-blue-50 h-48 flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <Wifi size={32} className="mx-auto mb-2 text-brand-400" />
                    <p className="text-sm">Coverage available in {NAIROBI_AREAS.length} areas</p>
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs font-semibold text-gray-500 mb-2">Covered areas include:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {NAIROBI_AREAS.slice(0, 10).map(a => (
                      <span key={a} className="text-xs bg-brand-light text-brand-600 px-2 py-0.5 rounded-full">{a}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Plan selection ────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-sm font-medium px-4 py-1.5 rounded-full mb-4">
                  <CheckCircle2 size={14} /> Fiber is available in {state.area}!
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-2">Choose your plan</div>
                <p className="text-gray-500">All plans include unlimited data, free installation, and 24/7 support.</p>
              </div>

              <div className="grid gap-4">
                {plans.map(plan => {
                  const isSelected = state.plan?.id === plan.id;
                  const TypeIcon   = plan.type === "business" ? Building2 : Home;
                  return (
                    <button key={plan.id}
                      onClick={() => set({ plan })}
                      className={cn(
                        "w-full text-left bg-white rounded-2xl border-2 p-5 transition-all",
                        isSelected
                          ? "border-brand-500 shadow-md shadow-brand-100"
                          : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                      )}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                            isSelected ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500"
                          )}>
                            <TypeIcon size={18} />
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{plan.name}</div>
                            <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                              <Zap size={12} className="text-brand-500" />
                              {plan.speed_down_mbps} Mbps down / {plan.speed_up_mbps} Mbps up
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xl font-bold text-gray-900">{formatKES(plan.price_kes)}</div>
                          <div className="text-xs text-gray-400">/{plan.billing_cycle}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {["Unlimited data","Free installation","24/7 support",
                          plan.type === "business" ? "SLA guarantee" : "Static IP",
                        ].map(f => (
                          <span key={f} className="text-xs bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg text-gray-600">
                            ✓ {f}
                          </span>
                        ))}
                      </div>

                      {isSelected && (
                        <div className="mt-3 flex items-center gap-2 text-brand-600 text-sm font-medium">
                          <CheckCircle2 size={14} /> Selected
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <NavButtons step={step} setStep={setStep} canNext={canNext[2]} />
            </div>
          )}

          {/* ── Step 3: Personal details ──────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900 mb-2">Your details</div>
                <p className="text-gray-500">We need a few details to set up your account and verify your identity.</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="label">Full name (as on ID)</label>
                    <input className="input py-3" placeholder="John Kariuki"
                      value={state.name} onChange={e => set({ name: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Phone number</label>
                    <input className="input py-3" placeholder="0712 345 678" type="tel"
                      value={state.phone} onChange={e => set({ phone: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">National ID number</label>
                    <input className="input py-3" placeholder="12345678"
                      value={state.idNumber} onChange={e => set({ idNumber: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Email address</label>
                    <input className="input py-3" placeholder="john@email.com" type="email"
                      value={state.email} onChange={e => set({ email: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Street / building name</label>
                    <input className="input py-3" placeholder="Apt 4B, Kilimani Rd"
                      value={state.street} onChange={e => set({ street: e.target.value })} />
                  </div>
                </div>

                {/* Selected plan summary */}
                {state.plan && (
                  <div className="bg-brand-light rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-brand-700">{state.plan.name}</div>
                      <div className="text-xs text-brand-600">{state.plan.speed_down_mbps} Mbps · Unlimited data</div>
                    </div>
                    <div className="text-lg font-bold text-brand-700">{formatKES(state.plan.price_kes)}<span className="text-sm font-normal">/mo</span></div>
                  </div>
                )}
              </div>

              <NavButtons step={step} setStep={setStep} canNext={canNext[3]} />
            </div>
          )}

          {/* ── Step 4: Account setup ─────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900 mb-2">Create your account</div>
                <p className="text-gray-500">Set a password to access your customer portal and manage your account.</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
                <div>
                  <label className="label">Password</label>
                  <input type="password" className="input py-3" placeholder="Min 8 characters"
                    value={state.password} onChange={e => set({ password: e.target.value })}
                    autoComplete="new-password" />
                </div>
                <div>
                  <label className="label">Confirm password</label>
                  <input type="password" className="input py-3" placeholder="Repeat password"
                    value={state.confirm} onChange={e => set({ confirm: e.target.value })}
                    autoComplete="new-password" />
                </div>

                {/* Strength hints */}
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { ok: state.password.length >= 8,                            label: "8+ characters" },
                    { ok: /\d/.test(state.password),                             label: "Contains number" },
                    { ok: /[A-Z]/.test(state.password),                          label: "Uppercase letter" },
                    { ok: state.password === state.confirm && !!state.password,  label: "Passwords match" },
                  ].map(h => (
                    <div key={h.label} className={cn(
                      "flex items-center gap-1.5 text-xs rounded-lg px-2 py-1",
                      h.ok ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-400"
                    )}>
                      <span>{h.ok ? "✓" : "○"}</span>
                      <span>{h.label}</span>
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</div>
                )}

                {/* Order summary */}
                <div className="border-t border-gray-100 pt-4 space-y-2 text-sm">
                  <div className="font-semibold text-gray-700 mb-3">Order summary</div>
                  {[
                    ["Plan",        state.plan?.name ?? "—"],
                    ["Speed",       state.plan ? `${state.plan.speed_down_mbps}↓ / ${state.plan.speed_up_mbps}↑ Mbps` : "—"],
                    ["Location",    state.area],
                    ["Monthly fee", state.plan ? formatKES(state.plan.price_kes) : "—"],
                    ["Installation","Free"],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between">
                      <span className="text-gray-500">{l}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-gray-100 font-semibold text-base">
                    <span>Due now (first month)</span>
                    <span className="text-brand-600">{state.plan ? formatKES(state.plan.price_kes) : "—"}</span>
                  </div>
                </div>

                <button
                  className="btn-primary w-full justify-center py-3 text-base"
                  onClick={createAccount}
                  disabled={!canNext[4] || loading}>
                  {loading ? "Setting up your account…" : "Activate my account →"}
                </button>
                <p className="text-xs text-gray-400 text-center">
                  By activating, you agree to our terms of service. You'll receive a first-month invoice payable via M-Pesa.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 5: Success ───────────────────────────────────────── */}
          {step === 5 && (
            <div className="text-center space-y-6">
              <div>
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={40} className="text-green-500" />
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-2">You're connected!</div>
                <p className="text-gray-500 text-lg">Welcome to FiberCRM, {state.name.split(" ")[0]}. 🎉</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-left space-y-3 text-sm">
                <div className="font-semibold text-gray-900 mb-4">What happens next:</div>
                {[
                  { step: "1", title: "Installation scheduled",    desc: "Our team will call you within 24 hours to schedule your free installation." },
                  { step: "2", title: "Invoice sent",              desc: `Your first invoice for ${state.plan ? formatKES(state.plan.price_kes) : ""} has been sent to ${state.email} and ${state.phone}.` },
                  { step: "3", title: "Pay via M-Pesa",            desc: `Paybill: ${process.env.NEXT_PUBLIC_MPESA_SHORTCODE ?? "174379"} · Account: your invoice number.` },
                  { step: "4", title: "Go live!",                  desc: "Once payment is confirmed and installation is done, your connection goes live." },
                ].map(s => (
                  <div key={s.step} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {s.step}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{s.title}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button className="btn-primary flex-1 justify-center py-3 text-base"
                  onClick={() => router.push("/portal")}>
                  Go to my portal →
                </button>
                <button className="btn-secondary flex-1 justify-center py-3"
                  onClick={() => router.push("/portal/invoices")}>
                  Pay first invoice
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Nav buttons ───────────────────────────────────────────────────────────────
function NavButtons({
  step, setStep, canNext, onNext,
}: {
  step: number;
  setStep: (n: number) => void;
  canNext: boolean;
  onNext?: () => void;
}) {
  return (
    <div className="flex gap-3">
      {step > 1 && (
        <button className="btn-secondary flex items-center gap-2 px-5"
          onClick={() => setStep(step - 1)}>
          <ArrowLeft size={14} /> Back
        </button>
      )}
      <button
        className="btn-primary flex-1 justify-center py-3 flex items-center gap-2 text-base"
        onClick={() => onNext ? onNext() : setStep(step + 1)}
        disabled={!canNext}>
        Continue <ArrowRight size={16} />
      </button>
    </div>
  );
}
