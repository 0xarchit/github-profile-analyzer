"use client";

import { AlertTriangle } from "lucide-react";
import type { EngineResult } from "@/lib/deterministic";
import { SignalRow } from "../widgets";

interface Props {
  data: EngineResult;
  expandedSignals: Set<string>;
  toggleSignal: (id: string) => void;
}

export function SignalsTab({ data, expandedSignals, toggleSignal }: Props) {
  const allSignals = Object.values(data.signals);
  const flaggedSignals = allSignals.filter((s) => s.flagged);
  const unflaggedSignals = allSignals.filter((s) => !s.flagged);

  const expandAll = () => {
    allSignals.forEach((s) => {
      if (!expandedSignals.has(s.id)) toggleSignal(s.id);
    });
  };
  const collapseAll = () => {
    expandedSignals.forEach((id) => toggleSignal(id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-heading text-black flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-yellow-600" /> Anomaly Signals ({flaggedSignals.length} flagged / {allSignals.length} total)</h2>
        <div className="flex gap-2">
          <button type="button" onClick={expandAll} className="px-3 py-1 rounded text-[10px] font-heading uppercase" style={{ background: "#e0f7fa", border: "3px solid black", color: "#0e7490" }}>Expand All</button>
          <button type="button" onClick={collapseAll} className="px-3 py-1 rounded text-[10px] font-heading uppercase" style={{ background: "#e8e6d8", border: "3px solid black", color: "#334155" }}>Collapse All</button>
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-pink-700" /><span className="text-gray-600">Flagged ({flaggedSignals.length})</span></div>
        <div className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-slate-600" /><span className="text-gray-600">Clean ({unflaggedSignals.length})</span></div>
        <div className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-yellow-600" /><span className="text-gray-600">Sampled</span></div>
        <div className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-gray-300" /><span className="text-gray-600">Unavailable</span></div>
      </div>
      {flaggedSignals.length > 0 && (
        <div className="space-y-2">
          {flaggedSignals.map((s) => <SignalRow key={s.id} signal={s} expanded={expandedSignals.has(s.id)} onToggle={() => toggleSignal(s.id)} flagged />)}
        </div>
      )}
      {unflaggedSignals.length > 0 && (
        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-heading text-gray-500 uppercase">Unflagged ({unflaggedSignals.length})</h3>
          {unflaggedSignals.map((s) => <SignalRow key={s.id} signal={s} expanded={expandedSignals.has(s.id)} onToggle={() => toggleSignal(s.id)} flagged={false} />)}
        </div>
      )}
    </div>
  );
}
