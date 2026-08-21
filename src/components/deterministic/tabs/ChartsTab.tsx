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
} from "../charts";
import { ChartSection } from "../widgets";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ChartDef {
  id: string;
  name: string;
  title: string;
  render: (value: any) => React.ReactNode;
}

export function ChartsTab({ charts }: { charts: Record<string, ChartResult> }) {
  const chartDefs: ChartDef[] = [
    {
      id: "4.1",
      name: "Contribution Calendar",
      title: "Contribution Calendar",
      render: (val) => <ContributionHeatmap days={val} />,
    },
    {
      id: "4.4",
      name: "Punch Card",
      title: "Punch Card",
      render: (val) => <PunchCard cells={val} />,
    },
    {
      id: "4.5",
      name: "Language Donut",
      title: "Language Distribution",
      render: (val) => <LanguageDonut items={val} />,
    },
    {
      id: "4.13",
      name: "Score Radar",
      title: "Score Radar",
      render: (val) => <MiniRadar items={val} />,
    },
    {
      id: "4.2",
      name: "Commit Activity",
      title: "Commit Activity (52 weeks)",
      render: (val) => <BarChartSimple items={val} />,
    },
    {
      id: "4.3",
      name: "Code Frequency",
      title: "Additions vs Deletions",
      render: (val) => <DivergingBars items={val} />,
    },
    {
      id: "4.6",
      name: "Size vs Stars",
      title: "Repository Size vs Stars",
      render: (val) => <ScatterPlot items={val} />,
    },
    {
      id: "4.9",
      name: "PR/Issue Funnel",
      title: "PR & Issue Funnel",
      render: (val) => <Funnel items={val} />,
    },
    {
      id: "4.12",
      name: "Weekday/Weekend",
      title: "Weekday vs Weekend",
      render: (val) => <PieSimple items={val} />,
    },
    {
      id: "4.22",
      name: "Event Mix",
      title: "Event Type Mix (30 days)",
      render: (val) => <PieSimple items={val} labelKey="type" />,
    },
    {
      id: "4.29",
      name: "Lorenz Curve",
      title: "Star Inequality (Lorenz Curve)",
      render: (val) => <LorenzCurve data={val} />,
    },
    {
      id: "4.30",
      name: "Repo Lifetimes",
      title: "Repository Lifetimes",
      render: (val) => <GanttChart items={val} />,
    },
    {
      id: "4.20",
      name: "By Repository",
      title: "Contributions by Repository",
      render: (val) => <BarChartHorizontal items={Array.isArray(val) ? (val as any[]).slice(0, 15) : []} />,
    },
    {
      id: "4.7",
      name: "Streak Timeline",
      title: "Streak Timeline",
      render: (val) => <StreakTimeline segments={val} />,
    },
    {
      id: "4.8",
      name: "Burst Overlay",
      title: "Burst Annotation Overlay",
      render: (val) => <BurstOverlay data={val} />,
    },
    {
      id: "4.11",
      name: "Creation Timeline",
      title: "Repository Creation Timeline",
      render: (val) => <RepoCreationTimeline items={val} />,
    },
    {
      id: "4.17",
      name: "PR Merge Time",
      title: "PR Merge Time",
      render: (val) => <HistogramChart items={val} unit="hrs" />,
    },
    {
      id: "4.18",
      name: "Issue Response",
      title: "Issue First-Response Latency",
      render: (val) => <HistogramChart items={val} unit="hrs" />,
    },
    {
      id: "4.19",
      name: "Commit Size",
      title: "Commit Size Distribution",
      render: (val) => <HistogramChart items={val} unit="lines" />,
    },
    {
      id: "4.31",
      name: "Lang x Repo",
      title: "Language by Repository",
      render: (val) => <LanguageRepoHeatmap data={val} />,
    },
    {
      id: "4.27",
      name: "Dependencies",
      title: "Dependency Ecosystems",
      render: (val) => (
        <PieSimple
          items={Array.isArray(val) ? (val as any[]).map((e: any) => ({
            label: e.ecosystem,
            value: e.value,
          })) : []}
        />
      ),
    },
    {
      id: "4.15",
      name: "Star Distribution",
      title: "Star Distribution by Repository",
      render: (val) => (
        <BarChartHorizontal
          items={Array.isArray(val) ? val.map((r: any) => ({ repository: r.repository ?? r.name ?? "repo", count: r.stars ?? r.count ?? 0 })) : []}
        />
      ),
    },
    {
      id: "4.16",
      name: "Stars vs Forks",
      title: "Stars vs Forks by Repository",
      render: (val) => (
        <BarChartHorizontal
          items={Array.isArray(val) ? val.map((r: any) => ({
            repository: `${r.repository ?? r.name ?? "repo"} (★${r.stars ?? 0} ⑂${r.forks ?? 0})`,
            count: (r.stars ?? 0) + (r.forks ?? 0),
          })) : []}
        />
      ),
    },
  ];

  const has = (id: string) => charts[id]?.value != null;
  const available = chartDefs.filter((c) => has(c.id));
  const unavailable = chartDefs.filter((c) => !has(c.id));

  return (
    <div className="space-y-6">
      {/* Chart availability overview */}
      <section
        className="rounded-xl p-4"
        style={{
          background: "white",
          border: "3px solid black",
          boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-heading text-black">Chart Availability</h3>
          <span className="text-[10px] text-gray-500">
            {available.length} / {chartDefs.length} available
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chartDefs.map((c) => {
            const isAvail = has(c.id);
            return (
              <span
                key={c.id}
                className="text-[9px] px-2 py-0.5 rounded font-heading"
                style={{
                  background: isAvail ? "#f0fdf4" : "#e8e6d8",
                  color: isAvail ? "#166534" : "#6b7280",
                  border: isAvail ? "2px solid #16a34a" : "2px solid black",
                }}
              >
                {c.name}
              </span>
            );
          })}
        </div>
        {unavailable.length > 0 && (
          <div className="text-[9px] text-gray-400 mt-2">
            Unavailable: {unavailable.map((c) => c.name).join(", ")}
          </div>
        )}
      </section>

      {/* Render all available charts from single source of truth */}
      {chartDefs.map((c) => {
        const chart = charts[c.id];
        if (!chart || chart.value == null) return null;
        return (
          <ChartSection key={c.id} title={c.title} chart={chart}>
            {c.render(chart.value)}
          </ChartSection>
        );
      })}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
