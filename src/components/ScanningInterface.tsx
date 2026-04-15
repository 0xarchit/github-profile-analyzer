"use client";

import { useState, useEffect } from "react";

const LOG_MESSAGES = [
  "Initializing Kernel Scan...",
  "Querying GitHub GraphQL API...",
  "Fetching Authored Meta-data...",
  "Analyzing Commit Patterns...",
  "Simulating Technical Debt...",
  "Deciphering Legacy Documentation...",
  "Measuring Caffeine-to-Code Ratio...",
  "Calculating Engineering Quotient...",
  "Roast Protocol Engaged...",
  "Finalizing Data Decryption...",
];

export function ScanningInterface() {
  const [progress, setProgress] = useState(0);
  const [currentLog, setCurrentLog] = useState(0);

  useEffect(() => {
    const pTimer = setInterval(() => {
      setProgress((p) => (p < 95 ? p + Math.random() * 8 : p));
    }, 400);

    const lTimer = setInterval(() => {
      setCurrentLog((l) => (l + 1) % LOG_MESSAGES.length);
    }, 1200);

    return () => {
      clearInterval(pTimer);
      clearInterval(lTimer);
    };
  }, []);

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
            Terminal Matrix: Initializing...
          </div>
          <h1 className="text-6xl md:text-8xl font-heading uppercase tracking-tighter leading-none text-black drop-shadow-[4px_4px_0px_#facc15] animate-in fade-in slide-in-from-bottom-4 delay-200">
            DECODING <span className="text-neo-pink">DNA</span>
          </h1>
        </header>

        <div className="neo-card bg-black h-32 flex items-center justify-center relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: "linear-gradient(transparent 95%, #4ade80 5%)",
              backgroundSize: "100% 10px",
            }}
          />
          <svg className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M 0 64 Q 100 0 200 64 T 400 64 T 600 64 T 800 64"
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
            <span>Bitstream Integrity</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-12 bg-white border-4 border-black flex p-1 shadow-neo overflow-hidden">
            <div
              className="h-full bg-neo-yellow flex transition-all"
              style={{ width: `${progress}%` }}
            >
              {[...Array(20)].map((_, i) => (
                <div key={i} className="flex-1 border-r border-black/20" />
              ))}
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6 min-h-35 flex flex-col justify-center border-4 relative overflow-hidden">
          <div
            key={currentLog}
            className="flex items-start gap-4 font-body font-bold text-lg animate-in fade-in"
          >
            <span className="text-neo-pink animate-bounce">&gt;</span>
            <span className="text-black/80">{LOG_MESSAGES[currentLog]}</span>
            <span className="w-2 h-6 bg-black animate-terminal-blink" />
          </div>
          <div className="mt-4 flex gap-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className={`h-2 w-12 border-2 border-black transition-colors duration-300 ${i <= currentLog % 3 ? "bg-neo-green" : "bg-transparent"}`}
              />
            ))}
          </div>
          <div className="absolute inset-0 pointer-events-none opacity-5 mix-blend-overlay protocol-noise" />
          <div className="absolute bottom-0 left-0 h-1 w-full bg-linear-to-r from-transparent via-neo-pink to-transparent animate-pulse" />
        </div>

        <footer className="text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-black/40">
            Protocol 0xARCHIT
          </p>
        </footer>
      </div>
    </div>
  );
}
