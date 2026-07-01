"use client";
// ─── Field App — Job Detail Page ──────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatDateTime, cn } from "@/lib/utils";
import { Badge, PageSpinner } from "@/components/ui";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, Phone, MapPin, CheckSquare, Square,
  Camera, FileText, CheckCircle2, AlertTriangle, Navigation,
} from "lucide-react";
import { useGPSTracking } from "@/hooks/useGPSTracking";

// Default checklists per job type
const DEFAULT_CHECKLISTS: Record<string, string[]> = {
  installation: [
    "Cable run from junction box to unit",
    "ONT device installed and powered on",
    "Router configured — SSID and password set",
    "Speed test passed (min 80% of plan speed)",
    "Customer walkthrough complete",
  ],
  repair: [
    "Check ONT indicator lights",
    "Ping test from ONT to gateway",
    "Inspect fiber cable for damage",
    "Check node status on network monitor",
    "Reboot ONT and router — wait 3 minutes",
    "Speed test after restoration",
  ],
  survey: [
    "Measure site perimeter and cable run distance",
    "Identify junction box entry points",
    "Count units / floors",
    "Check line of sight to nearest node",
    "Photograph entry points and duct routes",
    "Get property manager sign-off",
  ],
  upgrade: [
    "Confirm new plan details with customer",
    "Update router firmware if needed",
    "Reconfigure QoS settings for new speed",
    "Speed test confirming new plan speed",
    "Update static IP if applicable",
  ],
};

export default function FieldJobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createBrowserClient();
  const qc = useQueryClient();

  const [notes, setNotes]           = useState("");
  const [checklist, setChecklist]   = useState<{ label: string; done: boolean }[]>([]);
  const [signed, setSigned]         = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted]   = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ["field-job", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/field-jobs/${params.id}`);
      const d   = await res.json();
      // Init checklist from DB or defaults
      const cl = d.data?.checklist?.length
        ? d.data.checklist
        : (DEFAULT_CHECKLISTS[d.data?.type] ?? []).map((label: string) => ({ label, done: false }));
      setChecklist(cl);
      setNotes(d.data?.notes ?? "");
      return d.data;
    },
  });

  const updateJob = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch(`/api/field-jobs/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["field-jobs-today"] }),
  });

  const toggleCheck = (idx: number) => {
    const next = [...checklist];
    next[idx] = { ...next[idx], done: !next[idx].done };
    setChecklist(next);
    updateJob.mutate({ checklist: next });
  };

  async function handleStartJob() {
    await updateJob.mutateAsync({ status: "in_progress" });
    qc.invalidateQueries({ queryKey: ["field-job", params.id] });
    updateGPS("at_site");   // GPS: tell dispatch we're on site
  }

  async function handleComplete() {
    if (!signed) { alert("Please get customer signature first"); return; }
    setCompleting(true);
    await updateJob.mutateAsync({
      status:      "done",
      checklist,
      notes,
      signatureUrl: "signed",
    });
    updateGPS("on_duty");   // GPS: back to on_duty after completing job
    setCompleted(true);
    setCompleting(false);
  }

  if (isLoading) return <PageSpinner />;
  if (!job)      return <div className="p-4 text-red-500">Job not found</div>;

  const allDone      = checklist.every(c => c.done);
  const doneCount    = checklist.filter(c => c.done).length;
  const customer     = job.customers as any;
  const address      = job.addresses as any;
  const isScheduled  = ["scheduled","en_route"].includes(job.status);
  const isInProgress = job.status === "in_progress";
  const isDone       = job.status === "done";

  // Completed screen
  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-16 space-y-5 text-center">
        <CheckCircle2 size={56} className="text-green-500" />
        <h1 className="text-xl font-bold text-gray-900">Job complete!</h1>
        <p className="text-sm text-gray-500">
          {job.type.replace("_"," ")} at {customer?.name} signed off and synced.
        </p>
        <div className="w-full bg-gray-50 rounded-xl p-4 text-sm text-left space-y-2">
          {[
            ["Job",      `${job.type} · ${job.status}`],
            ["Customer", customer?.name],
            ["Location", address?.area],
            ["Synced",   "Just now"],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between">
              <span className="text-gray-400">{l}</span>
              <span className="font-medium capitalize">{v}</span>
            </div>
          ))}
        </div>
        <button className="btn-primary w-full justify-center" onClick={() => router.push("/field")}>
          Back to jobs
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="font-semibold text-gray-900 capitalize">{job.type.replace("_"," ")}</div>
          <div className="text-xs text-gray-400">{formatDateTime(job.scheduled_at)}</div>
        </div>
        <Badge variant={
          isDone ? "success" : isInProgress ? "info" :
          job.status === "en_route" ? "warning" : "gray"
        }>
          {job.status.replace("_"," ")}
        </Badge>
      </div>

      <div className="px-4 py-4 space-y-4 pb-6">
        {/* Customer info */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Customer</div>
          {[
            ["Name",    customer?.name],
            ["Address", address?.street],
            ["Area",    address?.area],
          ].map(([l, v]) => v && (
            <div key={l} className="flex justify-between text-sm">
              <span className="text-gray-400">{l}</span>
              <span className="font-medium text-gray-900 text-right max-w-[60%]">{v}</span>
            </div>
          ))}
          {customer?.phone && (
            <a href={`tel:${customer.phone}`}
              className="flex items-center gap-2 mt-3 text-brand-600 text-sm font-medium">
              <Phone size={14} /> {customer.phone}
            </a>
          )}
        </div>

        {/* Progress bar */}
        {checklist.length > 0 && (
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>Checklist progress</span>
              <span>{doneCount}/{checklist.length}</span>
            </div>
            <div className="flex gap-1">
              {checklist.map((_, i) => (
                <div key={i} className={cn(
                  "h-1.5 flex-1 rounded-full",
                  checklist[i].done ? "bg-brand-500" : "bg-gray-200"
                )} />
              ))}
            </div>
          </div>
        )}

        {/* Checklist */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
            Checklist
          </div>
          <div className="divide-y divide-gray-50">
            {checklist.map((item, idx) => (
              <button key={idx} disabled={isDone}
                onClick={() => toggleCheck(idx)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors">
                {item.done
                  ? <CheckSquare size={18} className="text-brand-500 flex-shrink-0 mt-0.5" />
                  : <Square size={18} className="text-gray-300 flex-shrink-0 mt-0.5" />
                }
                <span className={cn("text-sm", item.done && "line-through text-gray-400")}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Notes</div>
          <div className="p-4">
            <textarea
              className="w-full text-sm text-gray-700 bg-transparent outline-none resize-none min-h-[80px]"
              placeholder="Any observations, issues, or follow-up needed…"
              value={notes}
              disabled={isDone}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => updateJob.mutate({ notes })}
            />
          </div>
        </div>

        {/* Signature */}
        {!isDone && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Customer signature</div>
            <div className="p-4">
              <button
                onClick={() => setSigned(true)}
                className={cn(
                  "w-full h-20 rounded-lg border-2 border-dashed flex items-center justify-center text-sm transition-colors",
                  signed
                    ? "border-green-400 bg-green-50 text-green-700"
                    : "border-gray-200 text-gray-400 hover:border-gray-300"
                )}>
                {signed ? "✓ Customer signed" : "Tap to collect signature"}
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {isScheduled && (
          <button className="btn-primary w-full justify-center text-base py-3"
            onClick={handleStartJob} disabled={updateJob.isPending}>
            Start job
          </button>
        )}

        {isInProgress && (
          <button
            className={cn(
              "w-full py-3 rounded-xl text-base font-semibold transition-colors",
              allDone && signed
                ? "bg-brand-500 text-white hover:bg-brand-600"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
            onClick={handleComplete}
            disabled={!allDone || !signed || completing}>
            {completing ? "Completing…" : allDone && signed ? "Mark complete ✓" : `Complete checklist first (${doneCount}/${checklist.length})`}
          </button>
        )}

        {isDone && (
          <div className="flex items-center justify-center gap-2 py-4 text-green-600 text-sm font-medium">
            <CheckCircle2 size={16} /> Completed {job.completed_at ? formatDateTime(job.completed_at) : ""}
          </div>
        )}
      </div>
    </div>
  );
}
