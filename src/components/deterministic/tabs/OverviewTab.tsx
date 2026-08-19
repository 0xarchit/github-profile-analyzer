"use client";

import {
  TrendingUp,
  Activity,
  BarChart3,
  Target,
  AlertTriangle,
  CheckCircle,
  Clock,
  GitBranch,
  Star,
  Info,
} from "lucide-react";
import type { EngineResult } from "@/lib/deterministic";
import { ScoreCard, GradeRow, Metric } from "../widgets";
import { BaselineStats } from "../BaselineStats";
import { SignalsSummary } from "../SignalsSummary";

export function OverviewTab({ data }: { data: EngineResult }) {
  const { scores: sc, interpretation: ip } = data;
  return (
    <div className="space-y-8">

      {/* Score Breakdown Grid */}
      <section>
        <h2 className="text-lg font-heading text-black mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-cyan-700" /> Score Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Object.values(sc.breakdown).filter((r) => r.id !== "2.7" && typeof r.value === "number").map((r) => (
            <ScoreCard key={r.id} label={r.name.replace(/ score$/i, "")} value={r.value as number} weight={sc.weights[r.id] ?? 0} grade={ip.grades.find((g) => g.id === r.id)?.grade} />
          ))}
          <div className="rounded-xl p-4" style={{ background: "#fef9c3", border: "3px solid black" }}>
            <div className="text-[10px] font-heading uppercase text-yellow-600 mb-1">Auth Multiplier</div>
            <div className="text-2xl font-heading text-yellow-300">{sc.authenticityMultiplier.toFixed(2)}x</div>
            <div className="text-[10px] text-gray-500 mt-1">Weighted: {sc.weightedBeforeMultiplier}</div>
          </div>
        </div>
      </section>

      {/* Baseline Stats */}
      <BaselineStats data={data} />

      {/* Archetypes */}
      <section>
        <h2 className="text-lg font-heading text-black mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-pink-700" /> Archetypes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {ip.archetypes.slice(0, 4).map((a) => (
            <div key={a.id} className="rounded-xl p-4" style={{ background: a.rank === 1 ? "#e0f7fa" : "white", border: a.rank === 1 ? "3px solid black" : "3px solid black" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-heading uppercase text-gray-500">#{a.rank}</span>
                <span className="text-xs font-heading text-cyan-700">{a.score.toFixed(1)}</span>
              </div>
              <div className="text-sm font-heading text-black mb-1">{a.label}</div>
              <div className="text-[10px] text-gray-500 leading-relaxed">{a.description}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Work Rhythm & Style */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
          <h3 className="text-sm font-heading text-black mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-purple-700" /> Work Rhythm</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 rounded text-xs font-heading" style={{ background: "#f3e8ff", color: "#c084fc" }}>{ip.workRhythm.chronotypeTag}</span>
              <span className="text-xs text-gray-600">{ip.workRhythm.label}</span>
            </div>
            <div className="text-[11px] text-gray-500">{ip.workRhythm.chronotypeDescription}</div>
            <div className="text-[11px] text-gray-500">{ip.workRhythm.weekLabel}</div>
            <div className="text-[10px] text-gray-400">Peak: {ip.workRhythm.peakDayUtc} UTC {ip.workRhythm.peakHourUtc}:00 | {ip.workRhythm.totalSamples} samples</div>
            <div className="flex items-end gap-px h-12 mt-2">
              {ip.workRhythm.hourly.map((h) => (
                <div key={h.hour} className="flex-1 rounded-t" style={{ height: `${Math.max(2, h.share * 200)}%`, background: h.hour === ip.workRhythm.peakHourUtc ? "#a855f7" : "rgba(168,85,247,0.25)" }} title={`${h.hour}:00 UTC - ${(h.share * 100).toFixed(1)}%`} />
              ))}
            </div>
            <div className="flex justify-between text-[8px] text-gray-400"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
            <div className="flex items-end gap-1 h-8 mt-1">
              {ip.workRhythm.daily.map((d) => (
                <div key={d.day} className="flex-1 rounded-t flex flex-col items-center" style={{ height: `${Math.max(4, d.share * 150)}%`, background: "#67e8f9" }} title={`${d.label}: ${(d.share * 100).toFixed(1)}%`}>
                  <span className="text-[7px] text-gray-400 mt-auto">{d.label.slice(0, 2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
          <h3 className="text-sm font-heading text-black mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-700" /> Work Style Axes</h3>
          <div className="space-y-4">
            {ip.workStyle.map((axis) => (
              <div key={axis.id}>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-500">{axis.left}</span>
                  <span className="text-cyan-700 font-heading">{axis.label}</span>
                  <span className="text-gray-500">{axis.right}</span>
                </div>
                <div className="h-2 rounded-full relative" style={{ background: "#e8e6d8" }}>
                  <div className="absolute h-full w-2 rounded-full bg-cyan-700" style={{ left: `${axis.value}%`, transform: "translateX(-50%)" }} />
                  <div className="absolute h-full rounded-full" style={{ width: `${axis.value}%`, background: "linear-gradient(90deg, #e0f7fa, #67e8f9)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Momentum */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h3 className="text-sm font-heading text-black mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-700" /> Momentum</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><div className="text-2xl font-heading text-black">{ip.momentum.current90}</div><div className="text-[10px] text-gray-500">Current 90d</div></div>
          <div><div className="text-2xl font-heading text-gray-600">{ip.momentum.previous90}</div><div className="text-[10px] text-gray-500">Previous 90d</div></div>
          <div><div className="text-2xl font-heading text-cyan-700">{ip.momentum.deltaPercent !== null ? `${ip.momentum.deltaPercent > 0 ? "+" : ""}${ip.momentum.deltaPercent}%` : "N/A"}</div><div className="text-[10px] text-gray-500">Delta</div></div>
          <div><div className="text-2xl font-heading text-yellow-600">{ip.momentum.label}</div><div className="text-[10px] text-gray-500">Status</div></div>
        </div>
        <p className="text-xs text-gray-500 mt-3">{ip.momentum.description}</p>
      </section>

      {/* Portfolio */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h3 className="text-sm font-heading text-black mb-4 flex items-center gap-2"><GitBranch className="w-4 h-4 text-yellow-600" /> Portfolio</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          {ip.portfolio.lifecycle.map((lc) => (
            <div key={lc.id} className="rounded-lg p-3 text-center" style={{ background: "#f8f7f0", border: "3px solid black" }}>
              <div className="text-xl font-heading text-black">{lc.count}</div>
              <div className="text-[10px] text-gray-500">{lc.label}</div>
              <div className="text-[9px] text-gray-400">{(lc.share * 100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
        {ip.portfolio.flagships.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-heading uppercase text-gray-500">Top Repositories</div>
            {ip.portfolio.flagships.map((f) => (
              <div key={f.repository} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "#f8f7f0" }}>
                <span className="text-xs text-black font-heading truncate flex-1">{f.repository}</span>
                <span className="text-[10px] text-yellow-600 flex items-center gap-1"><Star className="w-3 h-3" />{f.stars}</span>
                <span className="text-[10px] text-gray-500">{f.language ?? "?"}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${f.lifecycle === "active" ? "bg-green-500/20 text-green-700" : f.lifecycle === "maintained" ? "bg-yellow-500/20 text-yellow-600" : "bg-slate-500/20 text-gray-600"}`}>{f.lifecycle}</span>
                <span className="text-[10px] text-gray-400">Q:{f.readinessScore}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Signals Summary */}
      <SignalsSummary signals={data.signals} />

      {/* Tags */}
      <section>
        <h2 className="text-lg font-heading text-black mb-3">Tags</h2>
        <div className="flex flex-wrap gap-2">
          {ip.tags.filter((t) => t.active).map((t) => (
            <div key={t.id} className="group relative px-3 py-1.5 rounded-lg text-xs font-heading cursor-default" style={{ background: "#e0f7fa", border: "3px solid black", color: "#22d3ee" }}>
              {t.label}
              <div className="absolute bottom-full left-0 mb-2 p-3 rounded-lg text-[10px] text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 max-w-xs" style={{ background: "white", border: "2px solid black", boxShadow: '2px 2px 0px 0px rgba(0,0,0,1)' }}>
                {t.description}
                <div className="mt-1 text-gray-400">Confidence: {t.confidence.toFixed(0)}%</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Strengths & Focus Areas */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl p-5" style={{ background: "#f0fdf4", border: "3px solid black" }}>
          <h3 className="text-sm font-heading text-green-700 mb-3 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Strengths</h3>
          {ip.strengths.map((g) => <GradeRow key={g.id} grade={g} />)}
        </div>
        <div className="rounded-xl p-5" style={{ background: "#fef9c3", border: "3px solid black" }}>
          <h3 className="text-sm font-heading text-yellow-600 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Focus Areas</h3>
          {ip.focusAreas.map((g) => <GradeRow key={g.id} grade={g} />)}
        </div>
      </section>

      {/* Data Quality & Rule Status */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h3 className="text-sm font-heading text-black mb-3 flex items-center gap-2"><Info className="w-4 h-4 text-gray-600" /> Data Quality & Confidence</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <Metric label="Quality Score" value={`${ip.dataQuality.score}`} sub={ip.dataQuality.label} />
          <Metric label="Rule Coverage" value={`${ip.confidence.coveragePercent}%`} sub={`${ip.confidence.availableRules} available`} />
          <Metric label="Sample Depth" value={`${ip.dataQuality.sampleDepth}`} sub="normalized" />
          <Metric label="Freshness" value={`${ip.dataQuality.freshness}`} sub="score" />
          <Metric label="Confidence" value={`${ip.confidence.score}`} sub={ip.confidence.label} />
        </div>
        {(() => {
          const meta = data.meta;
          const items = [
            { label: "Skipped", count: meta.skippedRules.length, color: "#64748b" },
            { label: "Unavailable", count: meta.unavailableRules.length, color: "#f97316" },
            { label: "Sampled", count: meta.sampledRules.length, color: "#a855f7" },
            { label: "Warnings", count: meta.warnings.length, color: "#ef4444" },
          ];
          const total = items.reduce((s, i) => s + i.count, 0);
          return (
            <div className="space-y-2">
              <div className="text-[10px] font-heading uppercase text-gray-500 mb-1">Rule Coverage Breakdown</div>
              <div className="h-3 rounded-full overflow-hidden flex" style={{ background: "#e8e6d8" }}>
                {total === 0 ? (
                  <div className="h-full w-full bg-green-500/40 rounded-full" />
                ) : items.map((item) => (
                  <div key={item.label} style={{ width: `${(item.count / total) * 100}%`, background: item.color, opacity: 0.6 }} title={`${item.label}: ${item.count}`} />
                ))}
              </div>
              <div className="flex gap-4">
                {items.map((item) => (
                  <span key={item.label} className="text-[9px] flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm" style={{ background: item.color, opacity: 0.6 }} />
                    <span className="text-gray-500">{item.label}</span>
                    <span className="text-gray-600 font-heading">{item.count}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      </section>
    </div>
  );
}
