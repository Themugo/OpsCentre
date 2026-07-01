"use client";
// ─── Field App — Help Page ────────────────────────────────────────────────────

import { Phone, MessageSquare, BookOpen, AlertTriangle, ChevronRight } from "lucide-react";

const FAQ = [
  {
    q: "How do I mark a job as complete?",
    a: "Complete all checklist items, collect the customer's signature, then tap 'Mark complete'. The job syncs automatically.",
  },
  {
    q: "What if the customer isn't home?",
    a: "Tap 'Report a problem' on the job detail and select 'Customer unavailable'. The job will be rescheduled by dispatch.",
  },
  {
    q: "How do I add photos to a job?",
    a: "On the job detail page, scroll to 'Site photos' and tap the camera slots. Photos upload automatically when you have a connection.",
  },
  {
    q: "The app shows no jobs today — what do I do?",
    a: "Pull to refresh. If still empty, check your internet connection or contact dispatch.",
  },
  {
    q: "How do I escalate an urgent fault?",
    a: "From the job detail, tap 'Escalate to network team'. This creates a critical ticket and alerts the NOC team.",
  },
  {
    q: "Can I use the app offline?",
    a: "Yes — the app is a PWA. Job checklists and notes save locally and sync when you reconnect.",
  },
];

export default function FieldHelpPage() {
  return (
    <div>
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="text-base font-semibold text-gray-900">Help & support</div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Contact options */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Contact dispatch
          </div>
          <a href="tel:+254800000000"
            className="flex items-center gap-3 px-4 py-4 border-b border-gray-50 active:bg-gray-50">
            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <Phone size={16} className="text-green-600" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">Call dispatch</div>
              <div className="text-xs text-gray-400">0800 000 000 · Available 24/7</div>
            </div>
            <ChevronRight size={16} className="text-gray-300" />
          </a>
          <a href="sms:+254800000000"
            className="flex items-center gap-3 px-4 py-4 active:bg-gray-50">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <MessageSquare size={16} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">SMS dispatch</div>
              <div className="text-xs text-gray-400">For non-urgent messages</div>
            </div>
            <ChevronRight size={16} className="text-gray-300" />
          </a>
        </div>

        {/* Emergency */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-red-900">Safety emergency?</div>
            <div className="text-xs text-red-700 mt-0.5">
              If you encounter a safety hazard on site (e.g. exposed wires, unstable structure), leave immediately and call dispatch.
              Do NOT attempt to fix safety hazards yourself.
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            FAQ
          </div>
          {FAQ.map((item, i) => (
            <div key={i} className={`px-4 py-4 ${i < FAQ.length - 1 ? "border-b border-gray-50" : ""}`}>
              <div className="text-sm font-medium text-gray-900 mb-1">{item.q}</div>
              <div className="text-xs text-gray-500 leading-relaxed">{item.a}</div>
            </div>
          ))}
        </div>

        {/* Version */}
        <div className="text-center text-xs text-gray-400 py-2">
          FiberCRM Field App · v1.0.0
        </div>
      </div>
    </div>
  );
}
