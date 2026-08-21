"use client";

import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight } from "lucide-react";
import type { InterpretationGrade, SignalResult, ChartResult } from "@/lib/deterministic";
import { gradeColor } from "./helpers";

export function ScoreCard({ label, value, weight, grade }: { label: string; value: number; weight: number; grade?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "#e8e6d8", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-heading uppercase text-gray-500 truncate">{label}</span>
        {grade && <span className="text-[10px] font-heading" style={{ color: gradeColor(grade) }}>{grade}</span>}
      </div>
      <div className="text-xl font-heading text-black">{typeof value === "number" ? value.toFixed(1) : value}</div>
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(0,0,0,0.12)" }}>
          <div className="h-full rounded-full bg-cyan-700" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        </div>
        <span className="text-[9px] text-gray-400">{(weight * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

export function GradeRow({ grade }: { grade: InterpretationGrade }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-8 text-center text-sm font-heading" style={{ color: gradeColor(grade.grade) }}>{grade.grade}</span>
      <span className="text-xs text-gray-700 flex-1">{grade.label}</span>
      <span className="text-[10px] text-gray-500">{grade.score}/100</span>
    </div>
  );
}

export function SignalRow({ signal, expanded, onToggle, flagged }: { signal: SignalResult; expanded: boolean; onToggle: () => void; flagged: boolean }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ background: flagged ? "#fff1f2" : "white", border: flagged ? "2px solid #e11d48" : "2px solid black" }}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2 text-left"
      >
        {flagged ? (
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        ) : (
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        )}
        <span className="text-[10px] text-cyan-700 w-8 shrink-0 font-heading">{signal.id}</span>
        <span className={`text-xs flex-1 ${flagged ? "text-rose-900 font-semibold" : "text-gray-800"}`}>{signal.name}</span>
        <StatusBadge status={signal.status} />
        {expanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 text-[10px]">
          <p className="text-gray-500">{signal.description}</p>
          <div className="flex gap-4 text-gray-400">
            <span>Source: {signal.source}</span>
            <span>Cost: {signal.cost}</span>
            {signal.sampleSize !== undefined && <span>Sample: {signal.sampleSize}</span>}
            {signal.caveat && <span>Caveat: {signal.caveat}</span>}
          </div>
          {signal.value !== null && typeof signal.value === "object" && (
            <pre className="text-[9px] text-gray-400 overflow-x-auto max-h-32 overflow-y-auto bg-gray-100 p-2 rounded">{JSON.stringify(signal.value, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ok: "bg-green-100 text-green-700 border border-green-400",
    sampled: "bg-yellow-100 text-yellow-700 border border-yellow-400",
    unavailable: "bg-gray-200 text-gray-600 border border-gray-400",
    skipped: "bg-gray-200 text-gray-500 border border-gray-400",
    requires_oauth: "bg-purple-100 text-purple-700 border border-purple-400",
    derived: "bg-cyan-100 text-cyan-700 border border-cyan-400",
  };
  return <span className={`text-[8px] px-1.5 py-0.5 font-heading uppercase ${colors[status] ?? "bg-gray-200 text-gray-500 border border-gray-400"}`}>{status}</span>;
}

export function MetaCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = { cyan: "text-cyan-700", purple: "text-purple-600", yellow: "text-yellow-600", green: "text-green-600", pink: "text-pink-600", slate: "text-gray-600" };
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: "#f8f7f0", border: "3px solid black" }}>
      <div className={`text-sm font-heading ${colorMap[color] ?? "text-gray-600"}`}>{value}</div>
      <div className="text-[9px] text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

export function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: "#f8f7f0", border: "3px solid black" }}>
      <div className="text-lg font-heading text-black">{value}</div>
      <div className="text-[9px] text-gray-500">{label}</div>
      <div className="text-[8px] text-gray-400">{sub}</div>
    </div>
  );
}

export function ChartSection({ title, chart, children }: { title: string; chart: ChartResult; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading text-black">{title}</h3>
        <div className="flex items-center gap-2">
          <StatusBadge status={chart.status} />
          <span className="text-[9px] text-gray-400">{chart.source}</span>
        </div>
      </div>
      {children}
      {chart.caveat && <p className="text-[9px] text-gray-400 mt-3 italic">{chart.caveat}</p>}
    </section>
  );
}
