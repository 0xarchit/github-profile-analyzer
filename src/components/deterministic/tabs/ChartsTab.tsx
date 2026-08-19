"use client";

import type { ChartResult } from "@/lib/deterministic";
import {
  ContributionHeatmap,
  PunchCard,
  LanguageDonut,
  MiniRadar,
  BarChartSimple,
  DivergingBars,
  ScatterPlot,
  Funnel,
  PieSimple,
  LorenzCurve,
  GanttChart,
  BarChartHorizontal,
  StreakTimeline,
  BurstOverlay,
  RepoCreationTimeline,
  HistogramChart,
  LanguageRepoHeatmap,
  SecuritySeverities,
  StarHistory,
} from "../charts";
import { ChartSection } from "../widgets";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ChartsTab({ charts }: { charts: Record<string, ChartResult> }) {
  const v = (id: string) => (charts[id]?.value ?? null) as any;
  const chartDefs = [
    { id: "4.1", name: "Contribution Calendar" },
    { id: "4.4", name: "Punch Card" },
    { id: "4.5", name: "Language Donut" },
    { id: "4.13", name: "Score Radar" },
    { id: "4.2", name: "Commit Activity" },
    { id: "4.3", name: "Code Frequency" },
    { id: "4.6", name: "Size vs Stars" },
    { id: "4.9", name: "PR/Issue Funnel" },
    { id: "4.12", name: "Weekday/Weekend" },
    { id: "4.22", name: "Event Mix" },
    { id: "4.29", name: "Lorenz Curve" },
    { id: "4.30", name: "Repo Lifetimes" },
    { id: "4.20", name: "By Repository" },
    { id: "4.7", name: "Streak Timeline" },
    { id: "4.8", name: "Burst Overlay" },
    { id: "4.11", name: "Creation Timeline" },
    { id: "4.17", name: "PR Merge Time" },
    { id: "4.18", name: "Issue Response" },
    { id: "4.19", name: "Commit Size" },
    { id: "4.31", name: "Lang x Repo" },
    { id: "4.28", name: "Security Alerts" },
    { id: "4.27", name: "Dependencies" },
    { id: "4.15", name: "Star History" },
    { id: "4.16", name: "Star Velocity" },
  ];
  const available = chartDefs.filter((c) => charts[c.id]);
  const unavailable = chartDefs.filter((c) => !charts[c.id]);
  return (
    <div className="space-y-6">
      {/* Chart availability overview */}
      <section className="rounded-xl p-4" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-heading text-black">Chart Availability</h3>
          <span className="text-[10px] text-gray-500">{available.length} / {chartDefs.length} available</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chartDefs.map((c) => {
            const has = !!charts[c.id];
            return (
              <span key={c.id} className="text-[9px] px-2 py-0.5 rounded font-heading" style={{ background: has ? "#f0fdf4" : "#e8e6d8", color: has ? "#166534" : "#6b7280", border: has ? "2px solid #16a34a" : "2px solid black" }}>{c.name}</span>
            );
          })}
        </div>
        {unavailable.length > 0 && (
          <div className="text-[9px] text-gray-400 mt-2">Unavailable: {unavailable.map((c) => c.name).join(", ")}</div>
        )}
      </section>

      {charts["4.1"] && <ChartSection title="Contribution Calendar" chart={charts["4.1"]}><ContributionHeatmap days={v("4.1")} /></ChartSection>}
      {charts["4.4"] && <ChartSection title="Punch Card" chart={charts["4.4"]}><PunchCard cells={v("4.4")} /></ChartSection>}
      {charts["4.5"] && <ChartSection title="Language Distribution" chart={charts["4.5"]}><LanguageDonut items={v("4.5")} /></ChartSection>}
      {charts["4.13"] && <ChartSection title="Score Radar" chart={charts["4.13"]}><MiniRadar items={v("4.13")} /></ChartSection>}
      {charts["4.2"] && <ChartSection title="Commit Activity (52 weeks)" chart={charts["4.2"]}><BarChartSimple items={v("4.2")} /></ChartSection>}
      {charts["4.3"] && <ChartSection title="Additions vs Deletions" chart={charts["4.3"]}><DivergingBars items={v("4.3")} /></ChartSection>}
      {charts["4.6"] && <ChartSection title="Repository Size vs Stars" chart={charts["4.6"]}><ScatterPlot items={v("4.6")} /></ChartSection>}
      {charts["4.9"] && <ChartSection title="PR & Issue Funnel" chart={charts["4.9"]}><Funnel items={v("4.9")} /></ChartSection>}
      {charts["4.12"] && <ChartSection title="Weekday vs Weekend" chart={charts["4.12"]}><PieSimple items={v("4.12")} /></ChartSection>}
      {charts["4.22"] && <ChartSection title="Event Type Mix (30 days)" chart={charts["4.22"]}><PieSimple items={v("4.22")} labelKey="type" /></ChartSection>}
      {charts["4.29"] && <ChartSection title="Star Inequality (Lorenz Curve)" chart={charts["4.29"]}><LorenzCurve data={v("4.29")} /></ChartSection>}
      {charts["4.30"] && <ChartSection title="Repository Lifetimes" chart={charts["4.30"]}><GanttChart items={v("4.30")} /></ChartSection>}
      {charts["4.20"] && <ChartSection title="Contributions by Repository" chart={charts["4.20"]}><BarChartHorizontal items={(v("4.20") as any[]).slice(0, 15)} /></ChartSection>}
      {charts["4.7"] && <ChartSection title="Streak Timeline" chart={charts["4.7"]}><StreakTimeline segments={v("4.7")} /></ChartSection>}
      {charts["4.8"] && <ChartSection title="Burst Annotation Overlay" chart={charts["4.8"]}><BurstOverlay data={v("4.8")} /></ChartSection>}
      {charts["4.11"] && <ChartSection title="Repository Creation Timeline" chart={charts["4.11"]}><RepoCreationTimeline items={v("4.11")} /></ChartSection>}
      {charts["4.17"] && <ChartSection title="PR Merge Time" chart={charts["4.17"]}><HistogramChart items={v("4.17")} unit="hrs" /></ChartSection>}
      {charts["4.18"] && <ChartSection title="Issue First-Response Latency" chart={charts["4.18"]}><HistogramChart items={v("4.18")} unit="hrs" /></ChartSection>}
      {charts["4.19"] && <ChartSection title="Commit Size Distribution" chart={charts["4.19"]}><HistogramChart items={v("4.19")} unit="lines" /></ChartSection>}
      {charts["4.31"] && <ChartSection title="Language by Repository" chart={charts["4.31"]}><LanguageRepoHeatmap data={v("4.31")} /></ChartSection>}
      {charts["4.28"] && <ChartSection title="Security Alert Severities" chart={charts["4.28"]}><SecuritySeverities data={v("4.28")} /></ChartSection>}
      {charts["4.27"] && <ChartSection title="Dependency Ecosystems" chart={charts["4.27"]}><PieSimple items={(v("4.27") as any[]).map((e: any) => ({ label: e.ecosystem, value: e.value }))} /></ChartSection>}
      {charts["4.15"] && <ChartSection title="Cumulative Star History" chart={charts["4.15"]}><StarHistory data={v("4.15")} /></ChartSection>}
      {charts["4.16"] && <ChartSection title="Star Velocity (Stars/Month)" chart={charts["4.16"]}><BarChartSimple items={(v("4.16") as any[]).map((i: any) => ({ week: i.month, commits: i.stars }))} /></ChartSection>}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
