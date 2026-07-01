// ─── 404 Not Found Page ───────────────────────────────────────────────────────

import Link from "next/link";
import { FileQuestion, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* 404 illustration */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-brand-100 flex items-center justify-center">
          <FileQuestion size={40} className="text-brand-600" />
        </div>

        {/* Message */}
        <h1 className="text-6xl font-bold text-gray-900 mb-2">404</h1>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Page not found</h2>
        <p className="text-gray-500 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Link
            href="/dashboard"
            className="btn-primary flex items-center gap-2"
          >
            <Home size={16} />
            Go to dashboard
          </Link>
          <button
            onClick={() => history.back()}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Go back
          </button>
        </div>

        {/* Help text */}
        <p className="mt-8 text-sm text-gray-400">
          Need help?{" "}
          <Link href="/dashboard/tickets" className="text-brand-600 hover:underline">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
