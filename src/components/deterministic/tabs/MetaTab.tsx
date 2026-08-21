"use client";

import { Cpu, ChevronDown, ChevronRight } from "lucide-react";
import type { EngineResult } from "@/lib/deterministic";
import { MetaCard, StatusBadge } from "../widgets";

interface Props {
  data: EngineResult;
  expandedBaselines: boolean;
  setExpandedBaselines: (v: boolean) => void;
}

export function MetaTab({ data, expandedBaselines, setExpandedBaselines }: Props) {
  const { meta, baseline } = data;
  return (
    <div className="space-y-6">
      {/* Engine Info */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h2 className="text-lg font-heading text-black mb-4 flex items-center gap-2"><Cpu className="w-5 h-5 text-cyan-700" /> Engine Metadata</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetaCard label="Auth Tier" value={meta.authTier} color="cyan" />
          <MetaCard label="Mode" value={meta.analysisMode} color="purple" />
          <MetaCard label="Execution Time" value={meta.durationMs ? `${(meta.durationMs / 1000).toFixed(2)}s` : "< 1s"} color="green" />
          <MetaCard label="API Version" value={meta.apiVersion} color="yellow" />
          <MetaCard
            label="Timestamp"
            value={new Date(meta.timestamp).toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false }) + " UTC"}
            color="slate"
          />
        </div>
      </section>

      {/* Budget */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h3 className="text-sm font-heading text-black mb-3">API Budget</h3>
        <div className="space-y-3">
          {Object.entries(meta.budget).map(([label, b]) => (
            <div key={label}>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-gray-600 capitalize">{label}</span>
                <span className="text-gray-700">{b.used} / {b.limit} ({b.remaining} remaining)</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: "#e8e6d8" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${b.limit > 0 ? Math.min(100, (b.used / b.limit) * 100) : 0}%`,
                    background: b.remaining === 0 ? "#ef4444" : "#22d3ee",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cache & Source */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h3 className="text-sm font-heading text-black mb-3">Cache & Source Info</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetaCard label="Cache Hit" value={meta.cache.resultHit ? "Yes" : "No"} color="green" />
          <MetaCard label="Endpoint Hits" value={String(meta.cache.endpointHits)} color="cyan" />
          <MetaCard label="Endpoint Misses" value={String(meta.cache.endpointMisses)} color="yellow" />
          <MetaCard label="TTL" value={`${meta.cache.ttlSeconds}s`} color="slate" />
        </div>
      </section>

      {/* Rule Status Counts */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h3 className="text-sm font-heading text-black mb-3">Rule Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetaCard label="Skipped" value={String(meta.skippedRules.length)} color="slate" />
          <MetaCard label="Unavailable" value={String(meta.unavailableRules.length)} color="yellow" />
          <MetaCard label="Sampled" value={String(meta.sampledRules.length)} color="purple" />
          <MetaCard label="Warnings" value={String(meta.warnings.length)} color="pink" />
        </div>
        {meta.warnings.length > 0 && (
          <div className="mt-3 space-y-1">
            {meta.warnings.slice(0, 8).map((w, i) => <div key={i} className="text-[10px] text-yellow-600/70">- {w}</div>)}
          </div>
        )}
      </section>

      {/* Data Windows */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h3 className="text-sm font-heading text-black mb-3">Data Windows</h3>
        <div className="space-y-2">
          {Object.entries(meta.dataWindows).map(([key, val]) => (
            <div key={key} className="flex gap-3 text-[10px]">
              <span className="text-cyan-700 font-heading w-40 shrink-0">{key}</span>
              <span className="text-gray-500">{val}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Baseline Rules */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <button type="button" onClick={() => setExpandedBaselines(!expandedBaselines)} className="flex items-center gap-2 text-sm font-heading text-black w-full">
          {expandedBaselines ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Baseline Rules ({Object.keys(baseline).length})
        </button>
        {expandedBaselines && (
          <div className="mt-3 space-y-1">
            {Object.values(baseline).map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded" style={{ background: "#f8f7f0" }}>
                <span className="text-cyan-700 w-10 shrink-0">{r.id}</span>
                <StatusBadge status={r.status} />
                <span className="text-gray-700 flex-1 truncate">{r.name}</span>
                <span className="text-gray-400 shrink-0">{typeof r.value === "number" ? r.value : typeof r.value === "object" ? JSON.stringify(r.value).slice(0, 40) : String(r.value ?? "N/A").slice(0, 30)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Evidence Trace */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h3 className="text-sm font-heading text-black mb-3">Evidence Trace</h3>
        <div className="space-y-1">
          {data.interpretation.evidenceTrace.map((e) => (
            <div key={e.id} className="flex items-center gap-3 text-[10px] px-2 py-1.5 rounded" style={{ background: "#f8f7f0" }}>
              <StatusBadge status={e.status} />
              <span className="text-gray-700 w-32 truncate">{e.label}</span>
              <span className="text-gray-500 flex-1 truncate">{e.value}</span>
              <span className="text-gray-400">{e.freshness}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
