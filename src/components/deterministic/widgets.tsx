"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, HelpCircle, Wrench } from "lucide-react";
import type { InterpretationGrade, RuleResult, ScoreFactor, SignalResult, ChartResult } from "@/lib/deterministic";
import { gradeColor } from "./helpers";

function FactorBar({ item }: { item: ScoreFactor }) {
  const pct = item.max > 0 ? Math.min(100, Math.max(0, (item.earned / item.max) * 100)) : 0;
  const color = pct >= 80 ? "#15803d" : pct >= 50 ? "#ca8a04" : "#e11d48";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-heading text-black truncate">{item.label}</span>
        <span className="text-[11px] text-gray-500 shrink-0">{Math.round(item.earned)}/{item.max}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.1)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="text-[10px] text-gray-500">{item.detail}</div>
    </div>
  );
}

/**
 * Same interaction model as the hero-page BETA VERSION banner:
 * hover opens, hover-out closes instantly, click pins open,
 * re-click or clicking anywhere else closes.
 */
export function FactorTooltip({ rule, className, style, children }: { rule: RuleResult; className?: string; style?: React.CSSProperties; children?: React.ReactNode }) {
  const [openState, setOpenState] = useState<"hover" | "click" | null>(null);
  const [align, setAlign] = useState<"left" | "right">("left");
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  const POPOVER_WIDTH = 336; // w-80 + border

  const updateAlign = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAlign(rect.left + POPOVER_WIDTH > window.innerWidth - 8 ? "right" : "left");
  };

  useEffect(() => {
    if (openState !== "click") return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpenState(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [openState]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      updateAlign();
      setOpenState((state) => (state === "click" ? null : "click"));
    } else if (event.key === "Escape") {
      setOpenState(null);
    }
  };

  const hasFactors = Boolean(rule.factors?.length);
  const visible = openState !== null;
  return (
    <div
      ref={wrapRef}
      role="button"
      tabIndex={0}
      aria-expanded={openState === "click"}
      aria-describedby={visible ? tooltipId : undefined}
      className={`relative group cursor-pointer ${className ?? ""}`}
      style={style}
      onMouseEnter={() => { if (openState !== "click") { updateAlign(); setOpenState("hover"); } }}
      onMouseLeave={() => { if (openState !== "click") setOpenState(null); }}
      onClick={(e) => { e.stopPropagation(); updateAlign(); setOpenState(openState === "click" ? null : "click"); }}
      onKeyDown={onKeyDown}
    >
      {children}
      {visible && (
        <div
          ref={popRef}
          id={tooltipId}
          className={`absolute z-50 top-full mt-2 w-80 max-w-[calc(100vw-16px)] p-4 space-y-2.5 rounded-lg text-left animate-in fade-in duration-150 ${align === "right" ? "right-0" : "left-0"}`}
          style={{ background: "#fffef5", border: "3px solid black", boxShadow: "5px 5px 0px 0px rgba(0,0,0,1)" }}
          role="tooltip"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-cyan-700 shrink-0" />
              <span className="text-[11px] font-heading uppercase text-gray-500">Why this score</span>
            </div>
            {openState === "click" && <span className="text-[8px] font-heading uppercase px-1 py-0.5 bg-neo-yellow border border-black">pinned</span>}
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">{rule.description}</p>
          {hasFactors ? (
            <div className="space-y-2 pt-1">
              {rule.factors!.map((item) => <FactorBar key={item.label} item={item} />)}
            </div>
          ) : (
            <p className="text-[10px] text-gray-400 italic">No per-factor breakdown for this metric; see details on the Signals tab.</p>
          )}
          {rule.remediation && (
            <div className="flex items-start gap-1.5 pt-2" style={{ borderTop: "2px solid black" }}>
              <Wrench className="w-3.5 h-3.5 text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-yellow-700 font-semibold leading-snug">How to improve: {rule.remediation}</p>
            </div>
          )}
          {openState === "click" && (
            <p className="text-[8px] text-gray-400 uppercase font-heading pt-1">Click outside to close</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ScoreCard({ label, value, weight, grade, rule }: { label: string; value: number; weight: number; grade?: string; rule?: RuleResult }) {
  const card = (
    <>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-heading uppercase text-gray-500 truncate">{label}</span>
        {grade && <span className="text-[10px] font-heading" style={{ color: gradeColor(grade) }}>{grade}</span>}
      </div>
      <div className="text-2xl font-heading text-black">{typeof value === "number" ? value.toFixed(1) : value}</div>
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.12)" }}>
          <div className="h-full rounded-full bg-cyan-700" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        </div>
        <span className="text-[9px] text-gray-400">{(weight * 100).toFixed(0)}%</span>
      </div>
    </>
  );
  if (!rule) {
    return (
      <div className="rounded-xl p-3 cursor-default" style={{ background: "#e8e6d8", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }} tabIndex={0} aria-label={`${label}: ${typeof value === "number" ? value.toFixed(1) : value}`}>
        {card}
      </div>
    );
  }
  return (
    <FactorTooltip
      rule={rule}
      className="rounded-xl p-3 cursor-pointer"
      style={{ background: "#e8e6d8", border: "3px solid black", boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
    >
      <div aria-label={`${label}: ${typeof value === "number" ? value.toFixed(1) : value}. Hover for breakdown, click to pin.`}>
        {card}
      </div>
    </FactorTooltip>
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

function formatValuePreview(value: unknown): Array<{ key: string; value: string }> {
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .slice(0, 12)
    .map(([key, entry]) => ({
      key,
      value: typeof entry === "object" && entry !== null ? `{${Array.isArray(entry) ? `${entry.length} items` : Object.keys(entry).length > 0 ? "object" : ""}}` : String(entry),
    }));
}

export function SignalRow({ signal, expanded, onToggle, flagged }: { signal: SignalResult; expanded: boolean; onToggle: () => void; flagged: boolean }) {
  const preview = expanded ? formatValuePreview(signal.value) : [];
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
          {signal.remediation && (
            <p className="text-yellow-700 font-semibold flex items-start gap-1.5">
              <Wrench className="w-3 h-3 shrink-0 mt-0.5" /> How to address: {signal.remediation}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-400">
            <span>Source: {signal.source}</span>
            <span>Cost: {signal.cost}</span>
            {signal.sampleSize !== undefined && <span>Sample: {signal.sampleSize}</span>}
            {signal.caveat && <span>Caveat: {signal.caveat}</span>}
          </div>
          {preview.length > 0 && (
            <div className="rounded p-2 space-y-0.5" style={{ background: "#f8f7f0", border: "1px solid rgba(0,0,0,0.15)" }}>
              {preview.map((row) => (
                <div key={row.key} className="flex gap-2">
                  <span className="text-gray-500 font-heading w-36 shrink-0 truncate">{row.key}</span>
                  <span className="text-black break-all">{row.value}</span>
                </div>
              ))}
            </div>
          )}
          {signal.value !== null && typeof signal.value === "object" && (
            <details>
              <summary className="text-[9px] text-gray-400 cursor-pointer select-none">Raw data</summary>
              <pre className="text-[9px] text-gray-400 overflow-x-auto max-h-32 overflow-y-auto bg-gray-100 p-2 rounded">{JSON.stringify(signal.value, null, 2)}</pre>
            </details>
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
