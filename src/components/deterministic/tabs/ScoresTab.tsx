"use client";

import type { EngineResult } from "@/lib/deterministic";
import { ScoreRadar } from "../charts";
import { gradeColor } from "../helpers";

export function ScoresTab({ data }: { data: EngineResult }) {
  const { scores: sc, interpretation: ip } = data;
  const breakdown = Object.values(sc.breakdown).filter((r) => r.id !== "2.7" && typeof r.value === "number");
  const totalWeight = breakdown.reduce((s, r) => s + (sc.weights[r.id] ?? 0), 0);
  return (
    <div className="space-y-6">
      {/* Final Score Summary */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h2 className="text-lg font-heading text-black mb-3">Score Weight Breakdown</h2>
        <div className="space-y-2">
          {breakdown.map((r) => {
            const weight = sc.weights[r.id] ?? 0;
            const weighted = (r.value as number) * weight * sc.authenticityMultiplier;
            return (
              <div key={r.id} className="flex items-center gap-3">
                <span className="text-[10px] text-cyan-700 w-8 shrink-0 font-heading">{r.id}</span>
                <span className="text-[10px] text-gray-600 w-28 truncate shrink-0">{r.name.replace(/ score$/i, "")}</span>
                <div className="flex-1 h-2 rounded-full" style={{ background: "#e8e6d8" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, r.value as number))}%`, background: gradeColor(ip.grades.find((g) => g.id === r.id)?.grade ?? "C") }} />
                </div>
                <span className="text-[10px] text-black w-8 text-right shrink-0">{(r.value as number).toFixed(1)}</span>
                <span className="text-[9px] text-gray-400 w-10 text-right shrink-0">{(weight * 100).toFixed(0)}%</span>
                <span className="text-[9px] text-yellow-600 w-10 text-right shrink-0">{weighted.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end mt-3 pt-3" style={{ borderTop: "2px solid black" }}>
          <span className="text-xs text-gray-500">Total Weight: {(totalWeight * 100).toFixed(0)}% | Auth Multiplier: {sc.authenticityMultiplier.toFixed(2)}x</span>
        </div>
      </section>

      {/* Radar */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h2 className="text-lg font-heading text-black mb-4">Score Radar</h2>
        <ScoreRadar breakdown={sc.breakdown} weights={sc.weights} />
      </section>

      {/* Detailed grades */}
      <section>
        <h2 className="text-lg font-heading text-black mb-4">All Grades</h2>
        <div className="space-y-2">
          {ip.grades.map((g) => (
            <div key={g.id} className="flex items-center gap-4 rounded-lg px-4 py-3" style={{ background: "white", border: "2px solid black" }}>
              <span className="w-12 text-center text-lg font-heading" style={{ color: gradeColor(g.grade) }}>{g.grade}</span>
              <div className="flex-1">
                <div className="text-sm text-black font-heading">{g.label}</div>
                <div className="text-[10px] text-gray-500">{g.tier}</div>
              </div>
              <span className="text-sm font-heading text-gray-700">{g.score}/100</span>
              <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "#e8e6d8" }}>
                <div className="h-full rounded-full" style={{ width: `${g.score}%`, background: gradeColor(g.grade) }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Role Profile */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h3 className="text-sm font-heading text-black mb-3">Role Profile</h3>
        <div className="flex gap-4 mb-4">
          <div><span className="text-[10px] text-gray-500 block">Primary</span><span className="text-sm text-cyan-700 font-heading">{ip.roleProfile.primary}</span></div>
          <div><span className="text-[10px] text-gray-500 block">Secondary</span><span className="text-sm text-purple-700 font-heading">{ip.roleProfile.secondary}</span></div>
        </div>
        <div className="space-y-3">
          {ip.roleProfile.dimensions.map((d) => (
            <div key={d.id}>
              <div className="flex justify-between text-[10px] mb-1"><span className="text-gray-600">{d.label}</span><span className="text-black">{d.score.toFixed(1)}</span></div>
              <div className="h-1.5 rounded-full" style={{ background: "#e8e6d8" }}>
                <div className="h-full rounded-full bg-cyan-700" style={{ width: `${d.score}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quality Profile */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h3 className="text-sm font-heading text-black mb-3">Repository Quality <span className="text-cyan-700">{ip.qualityProfile.score}/100 ({ip.qualityProfile.grade})</span></h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
          {[["Docs", ip.qualityProfile.documentationCoverage], ["License", ip.qualityProfile.licenseCoverage], ["Tests", ip.qualityProfile.testCoverage], ["CI", ip.qualityProfile.ciCoverage], ["Releases", ip.qualityProfile.releaseCoverage], ["Security", ip.qualityProfile.securityCoverage]].map(([label, val]) => (
            <div key={label as string} className="text-center rounded-lg p-2" style={{ background: "#f8f7f0" }}>
              <div className="text-lg font-heading text-black">{((val as number) * 100).toFixed(0)}%</div>
              <div className="text-[9px] text-gray-500">{label as string}</div>
            </div>
          ))}
        </div>
        {ip.qualityProfile.repositories.length > 0 && (
          <div className="space-y-1.5">
            {ip.qualityProfile.repositories.map((r) => (
              <div key={r.repository} className="flex items-center gap-2 text-[10px] rounded px-2 py-1.5" style={{ background: "#f8f7f0" }}>
                <span className="text-gray-700 truncate flex-1">{r.repository}</span>
                <span className="text-yellow-600">Q:{r.readinessScore}</span>
                {r.documentation && <span className="text-green-700">Doc</span>}
                {r.license && <span className="text-green-700">Lic</span>}
                {r.tests && <span className="text-green-700">Test</span>}
                {r.ci && <span className="text-green-700">CI</span>}
                {r.securityCoverage > 0 && <span className="text-cyan-700">Sec</span>}
                <span className="text-gray-400">Rel:{r.releases}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
