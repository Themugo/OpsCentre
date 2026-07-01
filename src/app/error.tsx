"use client";
// ─── Error Boundary Component ─────────────────────────────────────────────────
// Catches React errors and displays a user-friendly error page.

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // Log the error to console in development
    console.error("[OpsCentre Error]", error);
    
    // In production, you would send this to an error tracking service like Sentry
    // Example: Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Error icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-100 flex items-center justify-center">
          <AlertTriangle size={32} className="text-red-600" />
        </div>

        {/* Error message */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-gray-500 mb-6">
          We encountered an unexpected error. Our team has been notified and is working on a fix.
        </p>

        {/* Error details (development only) */}
        {process.env.NODE_ENV === "development" && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-left">
            <p className="text-xs font-mono text-red-700 break-all">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-red-500 mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Try again
          </button>
          <a href="/" className="btn-secondary flex items-center gap-2">
            <Home size={16} />
            Go home
          </a>
        </div>

        {/* Support link */}
        <p className="mt-8 text-sm text-gray-400">
          If this keeps happening, please{" "}
          <a href="/dashboard/tickets" className="text-brand-600 hover:underline">
            contact support
          </a>
        </p>
      </div>
    </div>
  );
}
