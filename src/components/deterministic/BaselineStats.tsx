"use client";

import { BarChart3 } from "lucide-react";
import type { EngineResult } from "@/lib/deterministic";

export function BaselineStats({ data }: { data: EngineResult }) {
  const { baseline: bl } = data;
  const r = (id: string) => bl[id];
  const val = (id: string) => r(id)?.value;
  const num = (id: string, fallback = 0): number => {
    const v = val(id);
    if (typeof v === "number") return v;
    if (typeof v === "object" && v !== null) {
      const obj = v as Record<string, unknown>;
      if (typeof obj.days === "number") return obj.days;
      if (typeof obj.count === "number") return obj.count;
      if (typeof obj.activeYearCount === "number") return obj.activeYearCount;
    }
    return fallback;
  };
  const fmt = (v: unknown): string => {
    if (v === undefined || v === null) return "--";
    if (typeof v === "number") return v.toLocaleString();
    if (typeof v === "string") return v;
    return "--";
  };
  const status = (id: string) => r(id)?.status ?? "--";

  const ageDays = num("1.1");
  const ageYears = typeof val("1.1") === "object" && val("1.1") !== null ? (val("1.1") as Record<string, unknown>).years : null;
  const ageLabel = ageYears != null ? `${ageYears}y` : `${Math.round(ageDays / 365)}y ${Math.round(ageDays % 365)}d`;

  const origVal = val("1.3");
  const origRatio = typeof origVal === "object" && origVal !== null ? (origVal as Record<string, unknown>).originalRatio : null;

  const ffwVal = val("1.7");
  const ffRatio = typeof ffwVal === "object" && ffwVal !== null ? (ffwVal as Record<string, unknown>).capped : null;

  const langVal = val("1.8");
  const langDistinct = typeof langVal === "object" && langVal !== null ? (langVal as Record<string, unknown>).distinct : null;

  const prVal = val("1.11");
  const prsOpened = typeof prVal === "object" && prVal !== null ? (prVal as Record<string, unknown>).opened : null;

  const issVal = val("1.12");
  const issOpened = typeof issVal === "object" && issVal !== null ? (issVal as Record<string, unknown>).opened : null;

  const streakVal = val("1.14");
  const longest = typeof streakVal === "object" && streakVal !== null ? (streakVal as Record<string, unknown>).longest : null;
  const currentStreak = typeof streakVal === "object" && streakVal !== null ? (streakVal as Record<string, unknown>).current : null;

  const adVal = val("1.15");
  const adRatio = typeof adVal === "object" && adVal !== null ? (adVal as Record<string, unknown>).ratio : null;

  const readmeVal = val("1.19");
  const readmePresent = typeof readmeVal === "object" && readmeVal !== null ? (readmeVal as Record<string, unknown>).present : null;

  const pinnedVal = val("1.20");
  const pinnedCount = typeof pinnedVal === "object" && pinnedVal !== null ? (pinnedVal as Record<string, unknown>).count : null;

  const completeVal = val("1.24");
  const completeCount = typeof completeVal === "object" && completeVal !== null ? (completeVal as Record<string, unknown>).count : null;
  const completeTotal = typeof completeVal === "object" && completeVal !== null ? (completeVal as Record<string, unknown>).total : null;

  const relVal = val("1.25");
  const totalReleases = Array.isArray(relVal) ? relVal.reduce((s: number, item: Record<string, unknown>) => s + (typeof item.count === "number" ? item.count : 0), 0) : null;

  const archVal = val("1.28");
  const archivedCount = typeof archVal === "object" && archVal !== null ? (archVal as Record<string, unknown>).archived : null;

  const templVal = val("1.29");
  const templCount = typeof templVal === "object" && templVal !== null ? (templVal as Record<string, unknown>).count : null;

  const yearsVal = val("1.31");
  const yearsActive = typeof yearsVal === "object" && yearsVal !== null ? (yearsVal as Record<string, unknown>).activeYearCount : null;

  const stat = [
    { label: "Account Age", value: ageLabel, icon: "\u231A", color: "#06b6d4" },
    { label: "Public Repos", value: fmt(num("1.2")), icon: "\u{1F4C1}", color: "#facc15" },
    { label: "Original Repos", value: origRatio != null ? `${Math.round(Number(origRatio) * 100)}%` : "--", icon: "\u2606", color: "#22c55e" },
    { label: "Total Stars", value: fmt(num("1.5")), icon: "\u2605", color: "#facc15" },
    { label: "Total Forks", value: fmt(num("1.6")), icon: "\u{1F500}", color: "#a855f7" },
    { label: "Followers/Following", value: ffRatio != null ? String(ffRatio) : "--", icon: "\u{1F465}", color: "#ec4899" },
    { label: "Languages", value: langDistinct != null ? String(langDistinct) : "--", icon: "\u{1F4BB}", color: "#f97316" },
    { label: "Total Contributions", value: fmt(num("1.10")), icon: "\u2714", color: "#22c55e" },
    { label: "Total PRs", value: prsOpened != null ? String(prsOpened) : status("1.11"), icon: "\u{1F500}", color: "#3b82f6" },
    { label: "Total Issues", value: issOpened != null ? String(issOpened) : status("1.12"), icon: "\u{1F41B}", color: "#facc15" },
    { label: "Longest Streak", value: longest != null ? `${longest}d` : "--", icon: "\u{1F525}", color: "#ef4444" },
    { label: "Current Streak", value: currentStreak != null ? `${currentStreak}d` : "--", icon: "\u{1F4C8}", color: "#22c55e" },
  ];
  const stat2 = [
    { label: "Active Days Ratio", value: adRatio != null ? `${Math.round(Number(adRatio) * 100)}%` : "--", color: "#a855f7" },
    { label: "Profile README", value: readmePresent === true ? "Yes" : readmePresent === false ? "No" : "--", color: "#06b6d4" },
    { label: "Pinned Repos", value: fmt(pinnedCount), color: "#facc15" },
    { label: "Gists", value: fmt(num("1.21")), color: "#ec4899" },
    { label: "Starred Repos", value: fmt(num("1.22")), color: "#f97316" },
    { label: "Profile Complete", value: completeCount != null && completeTotal != null ? `${completeCount}/${completeTotal}` : "--", color: "#22c55e" },
    { label: "Total Releases", value: fmt(totalReleases), color: "#a855f7" },
    { label: "Archived Repos", value: fmt(archivedCount), color: "#64748b" },
    { label: "Template Repos", value: fmt(templCount), color: "#facc15" },
    { label: "Years Active", value: fmt(yearsActive), color: "#06b6d4" },
    { label: "Reviews", value: fmt(num("1.13")), color: "#ec4899" },
    { label: "Org Memberships", value: fmt(num("1.18")), color: "#3b82f6" },
  ];
  return (
    <section>
      <h2 className="text-lg font-heading text-black mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-cyan-700" /> Baseline Statistics</h2>
      <div className="rounded-xl p-5 space-y-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {stat.map((s) => (
            <div key={s.label} className="rounded-lg p-3 text-center" style={{ background: "#f8f7f0", border: `1px solid ${s.color}22` }}>
              <div className="text-xs mb-0.5 opacity-40">{s.icon}</div>
              <div className="text-sm font-heading" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[9px] text-gray-500 mt-0.5 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="h-px" style={{ background: "#e8e6d8" }} />
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {stat2.map((s) => (
            <div key={s.label} className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: "#f8f7f0", border: "2px solid black" }}>
              <span className="text-[10px] text-gray-500">{s.label}</span>
              <span className="text-xs font-heading" style={{ color: s.color }}>{String(s.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
