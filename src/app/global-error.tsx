"use client";
// ─── Global Error Handler ─────────────────────────────────────────────────────
// Catches errors that occur outside of the root layout.

import { useEffect } from "react";
import { AlertOctagon, RefreshCw, Home } from "lucide-react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[OpsCentre Global Error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-gray-50">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            {/* Critical error icon */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-red-100 flex items-center justify-center">
              <AlertOctagon size={40} className="text-red-600" />
            </div>

            {/* Error message */}
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Application Error
            </h1>
            <p className="text-gray-500 mb-6">
              A critical error occurred. Please refresh the page or try again later.
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
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-600 transition-colors"
              >
                <RefreshCw size={16} />
                Try again
              </button>
              <a
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                <Home size={16} />
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
