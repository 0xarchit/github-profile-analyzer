"use client";

import { BarChart3 } from "lucide-react";
import type { EngineResult } from "@/lib/deterministic";

export function BaselineStats({ data }: { data: EngineResult }) {
  const { baseline: bl } = data;
  const r = (id: string) => bl[id];
  const val = (id: string) => r(id)?.value;

  const num = (id: string): number | undefined => {
    const v = val(id);
    if (typeof v === "number") return v;
    if (typeof v === "object" && v !== null) {
      const obj = v as Record<string, unknown>;
      if (typeof obj.days === "number") return obj.days;
      if (typeof obj.count === "number") return obj.count;
      if (typeof obj.activeYearCount === "number") return obj.activeYearCount;
      if (typeof obj.total === "number") return obj.total;
    }
    return undefined;
  };

  const safeProp = <T = unknown>(id: string, prop: string): T | undefined => {
    const v = val(id);
    if (typeof v === "object" && v !== null) {
      return (v as Record<string, unknown>)[prop] as T;
    }
    return undefined;
  };

  const fmt = (v: unknown): string => {
    if (v === undefined || v === null) return "--";
    if (typeof v === "number") return v.toLocaleString();
    if (typeof v === "string") return v;
    return "--";
  };

  const status = (id: string) => r(id)?.status ?? "--";

  const ageDays = num("1.1");
  const ageYears = safeProp<number>("1.1", "years");
  const ageLabel =
    ageYears != null
      ? `${ageYears}y`
      : ageDays != null
        ? `${Math.round(ageDays / 365)}y ${Math.round(ageDays % 365)}d`
        : "--";

  const origRatio = safeProp<number>("1.3", "originalRatio");
  const ffRatio = safeProp<number | string>("1.7", "capped");
  const langDistinct = safeProp<number>("1.8", "distinct");
  const prsOpened = safeProp<number>("1.11", "opened");
  const issOpened = safeProp<number>("1.12", "opened");
  const longest = safeProp<number>("1.14", "longest");
  const currentStreak = safeProp<number>("1.14", "current");
  const adRatio = safeProp<number>("1.15", "ratio");
  const readmePresent = safeProp<boolean>("1.19", "present");
  const pinnedCount = safeProp<number>("1.20", "count");
  const completeCount = safeProp<number>("1.24", "count");
  const completeTotal = safeProp<number>("1.24", "total");

  const relVal = val("1.25");
  const totalReleases = Array.isArray(relVal)
    ? relVal.reduce(
        (s: number, item: Record<string, unknown>) =>
          s + (typeof item.count === "number" ? item.count : 0),
        0,
      )
    : undefined;

  const archivedCount = safeProp<number>("1.28", "archived");
  const templCount = safeProp<number>("1.29", "count");
  const yearsActive = safeProp<number>("1.31", "activeYearCount");

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
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}>
        <h3 className="text-sm font-heading text-black mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-cyan-700" /> Core Repository &amp; Contribution Metrics
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {stat.map((s) => (
            <div key={s.label} className="rounded-lg p-2.5 text-center" style={{ background: "#f8f7f0", border: "2px solid black" }}>
              <div className="text-base font-heading text-black">{s.value}</div>
              <div className="text-[10px] text-gray-500 truncate">{s.label}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}>
        <h3 className="text-sm font-heading text-black mb-3">Extended Profile &amp; Quality Facts</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {stat2.map((s) => (
            <div key={s.label} className="rounded-lg p-2.5 text-center" style={{ background: "#f8f7f0", border: "2px solid black" }}>
              <div className="text-base font-heading text-black">{s.value}</div>
              <div className="text-[10px] text-gray-500 truncate">{s.label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
