"use client";

import type { RuleResult } from "@/lib/deterministic";

/* ================================================================
   CHART COMPONENTS
   ================================================================ */

export function ContributionHeatmap({ days }: { days: Array<{ date: string; count: number; weekday: number; week: number }> }) {
  if (!days || !days.length) {
    return <div className="text-xs text-gray-400 py-4">No contribution activity recorded</div>;
  }
  const maxCount = Math.max(1, ...days.map((d) => d.count));
  const cellSize = 11;
  const gap = 2;
  const maxWeek = Math.max(0, ...days.map((d) => d.week));
  const weeks = maxWeek + 1;
  return (
    <div className="overflow-x-auto">
      <svg width={weeks * (cellSize + gap) + 30} height={7 * (cellSize + gap) + 20} className="text-[10px]">
        {["", "Mon", "", "Wed", "", "Fri", ""].map((label, i) => (
          <text key={i} x={0} y={i * (cellSize + gap) + 10 + cellSize / 2} fill="#374151" fontSize={8} textAnchor="start">{label}</text>
        ))}
        {days.map((d, i) => {
          const opacity = d.count === 0 ? 0.05 : 0.2 + (d.count / maxCount) * 0.8;
          return (
            <rect key={i} x={24 + d.week * (cellSize + gap)} y={d.weekday * (cellSize + gap)} width={cellSize} height={cellSize} rx={2}
              fill={`rgba(6,182,212,${opacity})`}><title>{`${d.date}: ${d.count} contributions`}</title></rect>
          );
        })}
      </svg>
    </div>
  );
}

export function PunchCard({ cells }: { cells: Array<{ day: number; hour: number; count: number }> }) {
  const maxCount = Math.max(1, ...cells.map((c) => c.count));
  const size = 14;
  const gap = 2;
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="overflow-x-auto">
      <svg width={24 * (size + gap) + 40} height={7 * (size + gap) + 20}>
        {dayLabels.map((label, i) => (
          <text key={i} x={32} y={i * (size + gap) + 12 + size / 2} fill="#374151" fontSize={8} textAnchor="end">{label}</text>
        ))}
        {Array.from({ length: 24 }, (_, h) => h).filter((h) => h % 3 === 0).map((h) => (
          <text key={h} x={38 + h * (size + gap) + size / 2} y={7 * (size + gap) + 14} fill="#374151" fontSize={7} textAnchor="middle">{h}</text>
        ))}
        {cells.map((c, i) => {
          const opacity = c.count === 0 ? 0.05 : 0.15 + (c.count / maxCount) * 0.85;
          return (
            <rect key={i} x={38 + c.hour * (size + gap)} y={c.day * (size + gap)} width={size} height={size} rx={2}
              fill={`rgba(168,85,247,${opacity})`}><title>{`Day ${c.day}, Hour ${c.hour}: ${c.count}`}</title></rect>
          );
        })}
      </svg>
    </div>
  );
}

function buildDonutPaths(items: Array<{ share: number }>, cx: number, cy: number, r: number, innerR: number) {
  const rawTotal = items.reduce((s, i) => s + i.share, 0);
  const total = rawTotal > 0 ? rawTotal : 1;
  const paths: string[] = [];
  let cumAngle = -Math.PI / 2;
  for (const item of items) {
    const angle = ((rawTotal > 0 ? item.share : 1 / Math.max(1, items.length)) / total) * Math.PI * 2;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(startAngle), iy1 = cy + innerR * Math.sin(startAngle);
    const ix2 = cx + innerR * Math.cos(endAngle), iy2 = cy + innerR * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    paths.push(`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`);
  }
  return paths;
}

export function LanguageDonut({ items }: { items: Array<{ language: string; bytes: number; share: number }> }) {
  const colors = ["#06b6d4", "#facc15", "#ec4899", "#22c55e", "#a855f7", "#f97316", "#3b82f6", "#ef4444", "#14b8a6", "#8b5cf6"];
  const top = items.slice(0, 10);
  const cx = 90, cy = 90, r = 70, innerR = 42;
  const paths = buildDonutPaths(top, cx, cy, r, innerR);
  return (
    <div className="flex items-center gap-6">
      <svg width={180} height={180}>
        {top.map((_item, i) => (
          <path key={i} d={paths[i]} fill={colors[i % colors.length]} opacity={0.85} />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#e2e8f0" fontSize={14} fontWeight="bold">{top.length}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="#374151" fontSize={8}>languages</text>
      </svg>
      <div className="space-y-1.5">
        {top.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
            <span className="text-gray-700 w-24 truncate">{item.language}</span>
            <span className="text-gray-500">{(item.share * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoreRadar({ breakdown, weights }: { breakdown: Record<string, RuleResult<number | Record<string, unknown>>>; weights: Record<string, number> }) {
  const items = Object.values(breakdown).filter((r) => r.id !== "2.7" && typeof r.value === "number").map((r) => ({ id: r.id, label: r.name.replace(/ score$/i, ""), value: Number(r.value), weight: weights[r.id] ?? 0 }));
  return <MiniRadar items={items} />;
}

export function MiniRadar({ items }: { items: Array<{ id: string; label: string; value: number; weight: number }> }) {
  const cx = 120, cy = 120, r = 100;
  const n = items.length;
  const angleStep = (Math.PI * 2) / n;
  const levels = [20, 40, 60, 80, 100];
  const getPoint = (index: number, value: number) => {
    const angle = index * angleStep - Math.PI / 2;
    return { x: cx + (value / 100) * r * Math.cos(angle), y: cy + (value / 100) * r * Math.sin(angle) };
  };
  const dataPoints = items.map((item, i) => getPoint(i, item.value));
  return (
    <div className="flex items-center gap-6">
      <svg width={240} height={240}>
        {levels.map((level) => (
          <polygon key={level} points={items.map((_, i) => { const p = getPoint(i, level); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
        ))}
        {items.map((_, i) => {
          const p = getPoint(i, 100);
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(0,0,0,0.1)" strokeWidth={0.5} />;
        })}
        <polygon points={dataPoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(6,182,212,0.15)" stroke="#06b6d4" strokeWidth={1.5} />
        {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="#06b6d4" />)}
        {items.map((item, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const lx = cx + (r + 18) * Math.cos(angle);
          const ly = cy + (r + 18) * Math.sin(angle);
          return <text key={i} x={lx} y={ly} fill="#4b5563" fontSize={7} textAnchor="middle" dominantBaseline="middle">{item.label.slice(0, 8)}</text>;
        })}
      </svg>
      <div className="space-y-1 max-w-[180px]">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-[10px]">
            <span className="text-gray-600 flex-1 truncate">{item.label}</span>
            <span className="text-black font-heading">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarChartSimple({ items }: { items: Array<{ week: string; commits: number }> }) {
  const maxVal = Math.max(1, ...items.map((i) => i.commits));
  const barW = Math.max(2, Math.min(6, 600 / items.length));
  return (
    <div className="overflow-x-auto">
      <svg width={items.length * (barW + 1) + 10} height={80}>
        {items.map((item, i) => {
          const h = (item.commits / maxVal) * 65;
          return <rect key={i} x={5 + i * (barW + 1)} y={70 - h} width={barW} height={h} fill="#06b6d4" opacity={0.7} rx={1}><title>{`${item.week}: ${item.commits}`}</title></rect>;
        })}
        <line x1={5} y1={70} x2={5 + items.length * (barW + 1)} y2={70} stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
      </svg>
    </div>
  );
}

export function DivergingBars({ items }: { items: Array<{ week: string; additions: number; deletions: number }> }) {
  const maxVal = Math.max(1, ...items.map((i) => Math.max(i.additions, i.deletions)));
  const barW = Math.max(2, Math.min(4, 600 / items.length));
  const midY = 50;
  return (
    <div className="overflow-x-auto">
      <svg width={items.length * (barW + 1) + 10} height={110}>
        <line x1={5} y1={midY} x2={5 + items.length * (barW + 1)} y2={midY} stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
        {items.map((item, i) => {
          const addH = (item.additions / maxVal) * 45;
          const delH = (item.deletions / maxVal) * 45;
          return (
            <g key={i}>
              <rect x={5 + i * (barW + 1)} y={midY - addH} width={barW} height={addH} fill="#22c55e" opacity={0.7} rx={1} />
              <rect x={5 + i * (barW + 1)} y={midY} width={barW} height={delH} fill="#ef4444" opacity={0.7} rx={1} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ScatterPlot({ items }: { items: Array<{ repository: string; logSize: number; logStars: number; fork: boolean }> }) {
  const maxLogSize = Math.max(1, ...items.map((i) => i.logSize));
  const maxLogStars = Math.max(1, ...items.map((i) => i.logStars));
  return (
    <svg width={300} height={200}>
      <line x1={30} y1={180} x2={290} y2={180} stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
      <line x1={30} y1={10} x2={30} y2={180} stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
      {items.map((item, i) => {
        const x = 30 + (item.logSize / maxLogSize) * 255;
        const y = 175 - (item.logStars / maxLogStars) * 165;
        return <circle key={i} cx={x} cy={y} r={3} fill={item.fork ? "#f97316" : "#06b6d4"} opacity={0.7}><title>{item.repository}</title></circle>;
      })}
      <text x={160} y={198} fill="#374151" fontSize={8} textAnchor="middle">Log(Size)</text>
      <text x={8} y={95} fill="#374151" fontSize={8} textAnchor="middle" transform="rotate(-90, 8, 95)">Log(Stars)</text>
    </svg>
  );
}

export function Funnel({ items }: { items: Array<{ stage: string; value: number }> }) {
  const maxVal = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-1.5 max-w-md">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-[10px] text-gray-600 w-24 text-right shrink-0">{item.stage}</span>
          <div className="flex-1 h-5 rounded" style={{ background: "#e8e6d8" }}>
            <div className="h-full rounded" style={{ width: `${(item.value / maxVal) * 100}%`, background: `rgba(6,182,212,${0.3 + (i / items.length) * 0.5})` }} />
          </div>
          <span className="text-[10px] text-black w-10 text-right">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function buildPiePaths(values: number[], cx: number, cy: number, r: number, innerR: number) {
  const total = values.reduce((s, v) => s + v, 0) || 1;
  const paths: string[] = [];
  let cumAngle = -Math.PI / 2;
  for (const val of values) {
    const angle = (val / total) * Math.PI * 2;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(startAngle), iy1 = cy + innerR * Math.sin(startAngle);
    const ix2 = cx + innerR * Math.cos(endAngle), iy2 = cy + innerR * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    paths.push(`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`);
  }
  return paths;
}

export function PieSimple({ items, labelKey = "label" }: { items: Array<Record<string, string | number>>; labelKey?: string }) {
  const colors = ["#06b6d4", "#facc15", "#ec4899", "#22c55e", "#a855f7", "#f97316", "#3b82f6", "#ef4444"];
  const values = items.map((i) => typeof i.value === "number" ? i.value : 0);
  const cx = 70, cy = 70, r = 60, innerR = 35;
  const paths = buildPiePaths(values, cx, cy, r, innerR);
  return (
    <div className="flex items-center gap-4">
      <svg width={140} height={140}>
        {items.map((_item, i) => (
          <path key={i} d={paths[i]} fill={colors[i % colors.length]} opacity={0.8} />
        ))}
      </svg>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
            <span className="text-gray-700">{String(item[labelKey] ?? "N/A")}</span>
            <span className="text-gray-500">{typeof item.value === "number" ? item.value : 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LorenzCurve({ data }: { data: { points: Array<{ populationShare: number; starShare: number }>; gini: number } }) {
  const w = 250, h = 180, pad = 30;
  const scaleX = (v: number) => pad + v * (w - pad * 2);
  const scaleY = (v: number) => h - pad - v * (h - pad * 2);
  return (
    <div className="flex items-center gap-4">
      <svg width={w} height={h}>
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={pad} stroke="rgba(239,68,68,0.3)" strokeWidth={0.5} strokeDasharray="4,4" />
        <polyline points={data.points.map((p) => `${scaleX(p.populationShare)},${scaleY(p.starShare)}`).join(" ")} fill="none" stroke="#06b6d4" strokeWidth={1.5} />
        <polygon points={`${scaleX(0)},${scaleY(0)} ${data.points.map((p) => `${scaleX(p.populationShare)},${scaleY(p.starShare)}`).join(" ")} ${scaleX(1)},${scaleY(0)}`} fill="rgba(6,182,212,0.1)" />
        <text x={w / 2} y={h - 5} fill="#374151" fontSize={8} textAnchor="middle">Repos</text>
        <text x={5} y={h / 2} fill="#374151" fontSize={8} textAnchor="middle" transform={`rotate(-90, 5, ${h / 2})`}>Stars</text>
      </svg>
      <div className="text-center">
        <div className="text-2xl font-heading text-black">{data.gini}</div>
        <div className="text-[10px] text-gray-500">Gini</div>
      </div>
    </div>
  );
}

export function GanttChart({ items }: { items: Array<{ repository: string; start: string; end: string; dormant: boolean; archived: boolean }> }) {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 20);
  if (!sorted.length) return null;
  const minTime = new Date(sorted[0].start).getTime();
  const maxTime = Math.max(...sorted.map((i) => new Date(i.end).getTime()));
  const range = maxTime - minTime || 1;
  const rowH = 18, pad = 100, w = 600;
  return (
    <div className="overflow-x-auto">
      <svg width={w + pad} height={sorted.length * rowH + 20}>
        {sorted.map((item, i) => {
          const x1 = pad + ((new Date(item.start).getTime() - minTime) / range) * w;
          const x2 = pad + ((new Date(item.end).getTime() - minTime) / range) * w;
          const color = item.archived ? "#64748b" : item.dormant ? "#f97316" : "#22c55e";
          return (
            <g key={i}>
              <text x={pad - 4} y={i * rowH + 12} fill="#4b5563" fontSize={8} textAnchor="end">{item.repository.split("/")[1]?.slice(0, 12) ?? item.repository.slice(0, 12)}</text>
              <rect x={x1} y={i * rowH + 2} width={Math.max(2, x2 - x1)} height={12} rx={2} fill={color} opacity={0.6}><title>{item.repository}</title></rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function BarChartHorizontal({ items }: { items: Array<{ repository: string; count: number }> }) {
  const maxVal = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600 w-32 truncate text-right shrink-0">{item.repository.split("/")[1] ?? item.repository}</span>
          <div className="flex-1 h-3 rounded" style={{ background: "#e8e6d8" }}>
            <div className="h-full rounded bg-cyan-700/60" style={{ width: `${(item.count / maxVal) * 100}%` }} />
          </div>
          <span className="text-[10px] text-gray-500 w-8 text-right">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export function StreakTimeline({ segments }: { segments: Array<{ active: boolean; start: string; end: string; days: number }> }) {
  const totalDays = segments.reduce((s, seg) => s + seg.days, 0) || 1;
  return (
    <div className="flex h-6 rounded overflow-hidden">
      {segments.map((seg, i) => (
        <div key={i} style={{ width: `${(seg.days / totalDays) * 100}%` }} className={`${seg.active ? "bg-cyan-700" : "bg-gray-300"}`} title={`${seg.active ? "Active" : "Inactive"}: ${seg.days}d (${seg.start} to ${seg.end})`} />
      ))}
    </div>
  );
}

export function BurstOverlay({ data }: { data: Array<{ date: string; count: number; rolling7: number; z: number; burst: boolean }> }) {
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const w = Math.max(400, data.length * 3);
  const h = 60;
  return (
    <div className="overflow-x-auto">
      <svg width={w} height={h + 15}>
        <line x1={0} y1={h} x2={w} y2={h} stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
        {data.map((d, i) => {
          const x = (i / Math.max(1, data.length - 1)) * (w - 4) + 2;
          const barH = (d.count / maxCount) * (h - 5);
          return (
            <g key={i}>
              <rect x={x - 1} y={h - barH} width={2} height={barH} fill={d.burst ? "#ef4444" : "#06b6d4"} opacity={d.burst ? 0.9 : 0.4} />
              {d.burst && <circle cx={x} cy={h - barH - 4} r={2} fill="#ef4444" />}
            </g>
          );
        })}
        <text x={w / 2} y={h + 12} fill="#374151" fontSize={7} textAnchor="middle">Daily contributions (red = burst, z&gt;3)</text>
      </svg>
    </div>
  );
}

export function RepoCreationTimeline({ items }: { items: Array<{ repository: string; createdAt: string; fork: boolean; stars: number }> }) {
  const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!sorted.length) return null;
  const minTime = new Date(sorted[0].createdAt).getTime();
  const maxTime = Math.max(...sorted.map((i) => new Date(i.createdAt).getTime()));
  const range = maxTime - minTime || 1;
  const w = 600, h = Math.max(80, sorted.length * 12 + 20);
  return (
    <div className="overflow-x-auto">
      <svg width={w + 80} height={h}>
        {sorted.map((item, i) => {
          const x = 75 + ((new Date(item.createdAt).getTime() - minTime) / range) * w;
          return (
            <g key={i}>
              <text x={72} y={i * 12 + 10} fill="#4b5563" fontSize={7} textAnchor="end">{item.repository.split("/")[1]?.slice(0, 12) ?? "?"}</text>
              <circle cx={x} cy={i * 12 + 7} r={Math.min(5, 2 + Math.log2(item.stars + 1))} fill={item.fork ? "#f97316" : "#06b6d4"} opacity={0.7} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function HistogramChart({ items, unit }: { items: Array<{ min: number; max: number; count: number }>; unit: string }) {
  const maxVal = Math.max(1, ...items.map((i) => i.count));
  const barW = Math.min(40, Math.max(20, 400 / items.length));
  return (
    <div className="overflow-x-auto">
      <svg width={items.length * (barW + 4) + 30} height={100}>
        <line x1={25} y1={80} x2={25 + items.length * (barW + 4)} y2={80} stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
        {items.map((item, i) => {
          const barH = (item.count / maxVal) * 65;
          const label = item.max === Infinity ? ">" + item.min : `${item.min}-${item.max}`;
          return (
            <g key={i}>
              <rect x={28 + i * (barW + 4)} y={75 - barH} width={barW} height={barH} fill="#a855f7" opacity={0.6} rx={2} />
              <text x={28 + i * (barW + 4) + barW / 2} y={75 - barH - 3} fill="#c084fc" fontSize={8} textAnchor="middle">{item.count}</text>
              <text x={28 + i * (barW + 4) + barW / 2} y={90} fill="#374151" fontSize={6} textAnchor="middle">{label}</text>
            </g>
          );
        })}
        <text x={25 + items.length * (barW + 4) / 2} y={99} fill="#374151" fontSize={7} textAnchor="middle">{unit}</text>
      </svg>
    </div>
  );
}

export function LanguageRepoHeatmap({ data }: { data: { languages: string[]; repositories: string[]; cells: Array<{ language: string; repository: string; bytes: number }> } }) {
  const maxBytes = Math.max(1, ...data.cells.map((c) => c.bytes));
  const cellSize = 16;
  const labelW = 70, headerH = 50;
  return (
    <div className="overflow-x-auto">
      <svg width={labelW + data.repositories.length * (cellSize + 2) + 10} height={headerH + data.languages.length * (cellSize + 2) + 10}>
        {data.languages.map((lang, li) => (
          <text key={li} x={labelW - 4} y={headerH + li * (cellSize + 2) + cellSize / 2 + 4} fill="#4b5563" fontSize={7} textAnchor="end">{lang.slice(0, 10)}</text>
        ))}
        {data.repositories.map((repo, ri) => (
          <g key={ri}>
            <text x={labelW + ri * (cellSize + 2) + cellSize / 2} y={headerH - 4} fill="#4b5563" fontSize={6} textAnchor="end" transform={`rotate(-45, ${labelW + ri * (cellSize + 2) + cellSize / 2}, ${headerH - 4})`}>{repo.split("/")[1]?.slice(0, 8) ?? "?"}</text>
          </g>
        ))}
        {data.cells.map((cell, i) => {
          const ri = data.repositories.indexOf(cell.repository);
          const li = data.languages.indexOf(cell.language);
          if (ri < 0 || li < 0) return null;
          const opacity = cell.bytes === 0 ? 0.03 : 0.2 + (cell.bytes / maxBytes) * 0.8;
          return <rect key={i} x={labelW + ri * (cellSize + 2)} y={headerH + li * (cellSize + 2)} width={cellSize} height={cellSize} rx={2} fill={`rgba(6,182,212,${opacity})`} />;
        })}
      </svg>
    </div>
  );
}

export function SecuritySeverities({ data }: { data: { codeScanning: Record<string, number>; dependabot: Record<string, number> } }) {
  const severityColors: Record<string, string> = { critical: "#ef4444", high: "#f97316", medium: "#facc15", low: "#06b6d4", unknown: "#64748b" };
  const allSeverities = [...new Set([...Object.keys(data.codeScanning), ...Object.keys(data.dependabot)])];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[["Code Scanning", data.codeScanning], ["Dependabot", data.dependabot]].map(([label, counts]) => {
        const obj = counts as Record<string, number>;
        const total = Object.values(obj).reduce((s, v) => s + v, 0);
        return (
          <div key={label as string} className="rounded-lg p-3" style={{ background: "#f8f7f0" }}>
            <div className="text-[10px] font-heading text-gray-600 mb-2">{label as string} ({total} alerts)</div>
            <div className="space-y-1.5">
              {allSeverities.map((sev) => (
                <div key={sev} className="flex items-center gap-2">
                  <span className="text-[9px] w-16 text-right" style={{ color: severityColors[sev] ?? "#64748b" }}>{sev}</span>
                  <div className="flex-1 h-2 rounded-full" style={{ background: "#e8e6d8" }}>
                    <div className="h-full rounded-full" style={{ width: `${total > 0 ? ((obj[sev] ?? 0) / total) * 100 : 0}%`, background: severityColors[sev] ?? "#64748b" }} />
                  </div>
                  <span className="text-[9px] text-gray-500 w-6 text-right">{obj[sev] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StarHistory({ data }: { data: Array<{ repository: string; points: Array<{ at: string; cumulative: number }> }> }) {
  if (!data.length) return null;
  const maxStars = Math.max(1, ...data.flatMap((d) => d.points.map((p) => p.cumulative)));
  const allPoints = data.flatMap((d) => d.points);
  if (!allPoints.length) return null;
  const timestamps = allPoints.map((p) => new Date(p.at).getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const range = maxTime - minTime || 1;
  const w = 500, h = 150, pad = 30;
  const colors = ["#06b6d4", "#facc15", "#ec4899", "#22c55e", "#a855f7"];
  return (
    <div className="overflow-x-auto">
      <svg width={w + pad * 2} height={h + 20}>
        <line x1={pad} y1={h - pad} x2={w + pad} y2={h - pad} stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
        {data.slice(0, 5).map((repo, ri) => {
          const points = repo.points.map((p) => {
            const x = pad + ((new Date(p.at).getTime() - minTime) / range) * w;
            const y = (h - pad) - (p.cumulative / maxStars) * (h - pad * 2);
            return `${x},${y}`;
          }).join(" ");
          return <polyline key={ri} points={points} fill="none" stroke={colors[ri % colors.length]} strokeWidth={1.5} opacity={0.7} />;
        })}
        <text x={w / 2 + pad} y={h + 12} fill="#374151" fontSize={7} textAnchor="middle">{data.slice(0, 5).map((d, i) => `${d.repository.split("/")[1]?.slice(0, 8)} (${colors[i % colors.length]})`).join(" | ")}</text>
      </svg>
    </div>
  );
}
