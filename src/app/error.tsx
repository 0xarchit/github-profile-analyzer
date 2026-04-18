"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw, Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { reportClientError } from "@/lib/actions/report-client-error";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const showDetails = process.env.NODE_ENV !== "production";

  useEffect(() => {
    console.error("Diagnostic Matrix Exception:", error);
    void reportClientError({
      source: "CLIENT_ERROR_BOUNDARY",
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      url: typeof window !== "undefined" ? window.location.href : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    }).catch(() => null);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-neo-bg">
      <div className="neo-card max-w-xl w-full bg-white border-8 border-black shadow-neo-lg p-10 space-y-8 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rotate-45 translate-x-16 -translate-y-16" />

        <div className="relative inline-block">
          <AlertCircle className="w-24 h-24 text-red-500 drop-shadow-neo mx-auto" />
          <div className="absolute -bottom-2 -right-2 bg-black text-white text-[10px] font-black px-2 py-1 shadow-neo">
            ERROR_ID: {error.digest || "UNRESOLVED"}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-4xl md:text-5xl font-heading uppercase tracking-tighter leading-none">
            Protocol Interrupted
          </h2>
          <p className="font-body text-xl font-bold opacity-70">
            The diagnostic matrix encountered an unhandled exception. This shard
            is currently unstable.
          </p>
        </div>

        <div className="p-4 bg-red-50 border-4 border-black font-mono text-[10px] text-left overflow-auto max-h-32">
          {showDetails
            ? error.message || "Unknown kernel panic detected."
            : "Something went wrong while rendering this page."}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => reset()}
            className="neo-button bg-neo-yellow text-xl py-4 flex items-center justify-center gap-3 transition-transform active:scale-95"
          >
            <RotateCcw className="w-6 h-6" />
            Re-Initialize
          </button>
          <button
            onClick={() => router.push("/")}
            className="neo-button bg-white text-xl py-4 flex items-center justify-center gap-3 transition-transform active:scale-95"
          >
            <Home className="w-6 h-6" />
            Return Home
          </button>
        </div>
      </div>
    </div>
  );
}
