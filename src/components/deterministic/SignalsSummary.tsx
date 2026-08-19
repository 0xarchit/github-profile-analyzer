"use client";

import { AlertTriangle } from "lucide-react";
import type { SignalResult } from "@/lib/deterministic";

export function SignalsSummary({ signals }: { signals: Record<string, SignalResult> }) {
  const all = Object.values(signals);
  const flagged = all.filter((s) => s.flagged);
  const ok = all.filter((s) => !s.flagged);
  const byCategory: Record<string, { total: number; flagged: number }> = {};
  all.forEach((s) => {
    const cat = s.id.split(".")[0];
    if (!byCategory[cat]) byCategory[cat] = { total: 0, flagged: 0 };
    byCategory[cat].total++;
    if (s.flagged) byCategory[cat].flagged++;
  });
  const categoryNames: Record<string, string> = { "1": "Baseline", "2": "Scoring", "3": "Signals", "4": "Charts" };
  return (
    <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
      <h2 className="text-lg font-heading text-black mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-yellow-600" /> Signals Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg p-3 text-center" style={{ background: "#f8f7f0", border: "3px solid black" }}>
          <div className="text-2xl font-heading text-black">{all.length}</div>
          <div className="text-[9px] text-gray-500">Total Rules</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "#f0fdf4", border: "3px solid black" }}>
          <div className="text-2xl font-heading text-green-700">{ok.length}</div>
          <div className="text-[9px] text-gray-500">Clean</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "#fce7f3", border: "3px solid black" }}>
          <div className="text-2xl font-heading text-pink-700">{flagged.length}</div>
          <div className="text-[9px] text-gray-500">Flagged</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "#fef9c3", border: "3px solid black" }}>
          <div className="text-2xl font-heading text-yellow-600">{all.length > 0 ? ((flagged.length / all.length) * 100).toFixed(0) : 0}%</div>
          <div className="text-[9px] text-gray-500">Flag Rate</div>
        </div>
      </div>
      <div className="space-y-2">
        {Object.entries(byCategory).map(([cat, counts]) => (
          <div key={cat} className="flex items-center gap-3">
            <span className="text-[10px] font-heading text-gray-500 w-24 shrink-0">{categoryNames[cat] ?? cat}</span>
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#e8e6d8" }}>
              <div className="h-full flex">
                {counts.total > 0 && (
                  <div className="h-full bg-green-500/60" style={{ width: `${((counts.total - counts.flagged) / counts.total) * 100}%` }} />
                )}
                {counts.flagged > 0 && (
                  <div className="h-full bg-pink-500/60" style={{ width: `${(counts.flagged / counts.total) * 100}%` }} />
                )}
              </div>
            </div>
            <span className="text-[9px] text-gray-400 w-16 text-right shrink-0">{counts.total - counts.flagged} clean / {counts.flagged} flagged</span>
          </div>
        ))}
      </div>
      {flagged.length > 0 && (
        <div className="mt-4 space-y-1">
          <div className="text-[10px] font-heading uppercase text-pink-700/60 mb-2">Top Flagged</div>
          {flagged.slice(0, 5).map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[10px] rounded px-2 py-1" style={{ background: "#fce7f3" }}>
              <span className="text-pink-700 w-8 shrink-0">{s.id}</span>
              <span className="text-gray-700 flex-1 truncate">{s.name}</span>
              <span className="text-pink-700/60 shrink-0">{s.source}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
