"use client";

import { useState, useEffect } from "react";

export interface ScanningInterfaceProps {
  statusMessage?: string;
  currentStep?: string;
  progress?: number;
}

export function ScanningInterface({
  statusMessage,
  currentStep,
  progress: externalProgress,
}: ScanningInterfaceProps) {
  const [internalProgress, setInternalProgress] = useState(10);

  useEffect(() => {
    if (typeof externalProgress === "number") {
      setInternalProgress(externalProgress);
      return;
    }
    const timer = setInterval(() => {
      setInternalProgress((p) => (p < 90 ? p + Math.random() * 6 : p));
    }, 400);

    return () => clearInterval(timer);
  }, [externalProgress]);

  const activeProgress =
    typeof externalProgress === "number" ? externalProgress : internalProgress;

  return (
    <div className="fixed inset-0 bg-neo-bg z-100 flex flex-col items-center justify-center p-6 sm:p-12 overflow-hidden animate-in fade-in">
      <div className="absolute inset-0 protocol-noise opacity-10 pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.1] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(90deg, black 1px, transparent 0), linear-gradient(black 1px, transparent 0)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="max-w-3xl w-full space-y-12 relative z-10">
        <header className="text-center space-y-4">
          <div className="inline-block bg-black text-white px-6 py-2 text-xs font-black uppercase tracking-[0.5em] shadow-[0_0_20px_rgba(236,72,153,0.3)] border-2 border-neo-pink animate-in fade-in scale-in-95">
            {currentStep
              ? `STATUS: ${currentStep}`
              : "TELEMETRY PROTOCOL: LIVE STREAMING"}
          </div>
          <h1 className="text-5xl md:text-7xl font-heading uppercase tracking-tighter leading-none text-black drop-shadow-[4px_4px_0px_#facc15]">
            DECODING <span className="text-neo-pink">SHARDS</span>
          </h1>
        </header>

        <div className="neo-card bg-black h-28 flex items-center justify-center relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: "linear-gradient(transparent 95%, #4ade80 5%)",
              backgroundSize: "100% 10px",
            }}
          />
          <svg className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M 0 50 Q 100 0 200 50 T 400 50 T 600 50 T 800 50"
              fill="none"
              stroke="#4ade80"
              strokeWidth="4"
              className="animate-scan-dash"
              style={{ strokeDasharray: "20, 10" }}
            />
          </svg>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between font-heading uppercase text-sm italic">
            <span>Live Protocol Telemetry</span>
            <span>{Math.round(activeProgress)}%</span>
          </div>
          <div className="h-12 bg-white border-4 border-black flex p-1 shadow-neo overflow-hidden">
            <div
              className="h-full bg-neo-yellow flex transition-all duration-300"
              style={{ width: `${activeProgress}%` }}
            >
              {[...Array(20)].map((_, i) => (
                <div key={i} className="flex-1 border-r border-black/20" />
              ))}
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6 min-h-32 flex flex-col justify-center border-4 relative overflow-hidden">
          <div className="flex items-center gap-4 font-body font-bold text-base md:text-lg animate-in fade-in">
            <div className="w-4 h-4 bg-neo-pink rounded-full shrink-0 animate-ping" />
            <p className="uppercase font-mono text-black">
              {statusMessage || "Establishing real-time protocol telemetry stream..."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
