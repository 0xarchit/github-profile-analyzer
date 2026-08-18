"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import {
  RefreshCw,
  Cpu,
  TrendingUp,
  Activity,
  BarChart3,
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  GitBranch,
  Star,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import type { EngineResult, AnalysisProgressEvent, InterpretationGrade, SignalResult, ChartResult, RuleResult } from "@/lib/deterministic";

interface Props { username: string; }

export function DeterministicProfileClient({ username }: Props) {
  const router = useRouter();
  const [data, setData] = useState<EngineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgressEvent[]>([]);
  const [currentPhase, setCurrentPhase] = useState("");
  const [budget, setBudget] = useState({ rest: 0, graphql: 0, search: 0 });
  const [expandedSignals, setExpandedSignals] = useState<Set<string>>(new Set());
  const [expandedBaselines, setExpandedBaselines] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "scores" | "charts" | "signals" | "meta">("overview");

  const fetchData = useCallback(async (force = false) => {
    try {
      setIsRefreshing(force);
      setError(null);
      setProgress([]);
      const url = `/api/analyze/deterministic/stream?username=${encodeURIComponent(username)}`;
      const es = new EventSource(url);
      es.addEventListener("progress", (e) => {
        try {
          const ev = JSON.parse(e.data) as AnalysisProgressEvent;
          setProgress((p) => [...p.slice(-30), ev]);
          setCurrentPhase(ev.phase);
          setBudget({ rest: ev.budget.rest.used, graphql: ev.budget.graphql.used, search: ev.budget.search.used });
        } catch {}
      });
      es.addEventListener("complete", async (e) => {
        try {
          const r = JSON.parse(e.data) as EngineResult;
          setData(r);
          setError(null);
          es.close();
          const confetti = (await import("canvas-confetti")).default;
          confetti({ particleCount: 120, spread: 60, origin: { y: 0.6 }, colors: ["#06b6d4", "#facc15", "#ec4899", "#22c55e"] });
        } catch {}
      });
      es.addEventListener("error", (e) => {
        try { setError(JSON.parse((e as MessageEvent).data || "{}").error || "Analysis failed"); } catch { setError("ANALYSIS_FAILURE"); }
        es.close();
      });
      es.onerror = () => es.close();
    } catch { setError("NETWORK_FAILURE"); } finally { setIsRefreshing(false); }
  }, [username]);

  useEffect(() => {
    if (!username || username === "undefined" || username === "null") { setError("INVALID_ID"); return; }
    void fetchData();
  }, [username, fetchData]);

  const toggleSignal = (id: string) => setExpandedSignals((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // --- LOADING ---
  const phaseLabels: Record<string, string> = {
    "quota-profile": "Checking GitHub quota",
    "repository-discovery": "Discovering repositories",
    "public-activity": "Collecting public activity",
    "repository-enrichment": "Enriching top repositories",
    "issue-review-enrichment": "Collecting issues & reviews",
    "expensive-sampling": "Deep sampling",
    "collection-complete": "Collection complete",
    "rule-evaluation": "Evaluating rules",
    "interpretation": "Building interpretations",
    "complete": "Done",
  };
  const phaseOrder = Object.keys(phaseLabels);
  const currentPhaseIdx = phaseOrder.indexOf(currentPhase);
  const totalCalls = budget.rest + budget.graphql + budget.search;
  const recentProgress = progress.slice(-8);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (data || error) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [data, error]);

  if (!data && !error) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "#fdfcf0" }}>
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="relative inline-block">
            <Cpu className="w-16 h-16 text-cyan-700 mx-auto animate-pulse" />
            <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-cyan-400/30 animate-ping" style={{ animationDuration: "2s" }} />
          </div>
          <h1 className="text-4xl font-heading uppercase text-black">Deterministic Engine</h1>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: "#e0f7fa", border: "3px solid black" }}>
            <span className="text-[10px] font-black uppercase text-cyan-700">BETA</span>
            <span className="text-xs font-heading text-gray-700">Analyzing @{username}</span>
          </div>
        </div>

        <div className="rounded-xl p-6 space-y-5" style={{ background: "#f8f7f0", border: "3px solid black", backdropFilter: "blur(12px)" }}>
          {/* Phase dots */}
          <div className="flex items-center justify-center gap-1.5 mb-3">
            {phaseOrder.map((phase, i) => (
              <div key={phase} className="relative">
                <div className={`w-2 h-2 rounded-full transition-all duration-500 ${
                  i < currentPhaseIdx ? "bg-cyan-700" :
                  i === currentPhaseIdx ? "bg-cyan-700 animate-pulse scale-125" :
                  "bg-gray-300"
                }`} />
                {i === currentPhaseIdx && <div className="absolute inset-0 w-2 h-2 rounded-full bg-cyan-700/50 animate-ping" />}
              </div>
            ))}
          </div>
          {/* Phase progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-heading uppercase text-cyan-700 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                {phaseLabels[currentPhase] || currentPhase || "Initializing"}
              </span>
              <span className="text-[10px] text-gray-500">{totalCalls} API calls | {elapsed}s elapsed</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#e8e6d8" }}>
              <div className="h-full rounded-full transition-all duration-700" style={{
                width: currentPhaseIdx >= 0 ? `${((currentPhaseIdx + 1) / phaseOrder.length) * 100}%` : "5%",
                background: "linear-gradient(90deg, #0891b2, #7c3aed)"
              }} />
            </div>
            <div className="flex justify-between">
              {phaseOrder.filter((_, i) => i % 3 === 0).map((phase, i) => (
                <span key={phase} className={`text-[7px] ${i <= currentPhaseIdx / 3 ? "text-cyan-700/60" : "text-gray-400"}`}>{phaseLabels[phase]?.slice(0, 14)}</span>
              ))}
            </div>
          </div>

          {/* Budget counters */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[ ["REST", budget.rest, "text-cyan-700", "#e0f7fa", "3px solid black"], ["GraphQL", budget.graphql, "text-purple-600", "#f3e8ff", "3px solid black"], ["Search", budget.search, "text-yellow-600", "#fef9c3", "3px solid black"] ].map(([label, val, tc, bg, bc]) => (
              <div key={label as string} className="rounded-lg p-3" style={{ background: bg, border: bc, boxShadow: '3px 3px 0px 0px rgba(0,0,0,1)' }}>
                <div className={`text-2xl font-heading ${tc}`}>{val as number}</div>
                <div className="text-[10px] font-heading uppercase text-gray-500">{label as string}</div>
              </div>
            ))}
          </div>

          {/* Progress log */}
          <div className="space-y-1">
            {recentProgress.map((ev, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${ev.kind === "phase" ? "bg-cyan-700" : ev.kind === "retry" ? "bg-yellow-600" : ev.kind === "warning" ? "bg-orange-400" : "bg-slate-600"}`} />
                <span className="text-gray-500 font-mono shrink-0 w-14">{ev.kind}</span>
                <span className="text-gray-600 flex-1 leading-tight">{ev.message}</span>
              </div>
            ))}
            {recentProgress.length === 0 && (
              <div className="text-center py-4">
                <div className="inline-flex items-center gap-2 text-gray-500">
                  <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                  <span className="text-xs">Connecting to GitHub...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // --- ERROR ---
  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#fdfcf0" }}>
      <div className="max-w-md w-full text-center space-y-6 rounded-xl p-8" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <XCircle className="w-16 h-16 text-pink-700 mx-auto" />
        <h2 className="text-3xl font-heading uppercase text-black">Engine Failure</h2>
        <p className="text-sm text-black font-mono">{error}</p>
        <button onClick={() => router.push("/")} className="w-full py-3 neo-button bg-neo-yellow font-bold text-sm">Return to Hub</button>
      </div>
    </div>
  );

  if (!data) return null;
  const { scores, interpretation: interp, signals, charts, profile } = data;
  const score = scores.finalScore;
  const allSignals = Object.values(signals);
  const flaggedSignals = allSignals.filter((s) => s.flagged);
  const unflaggedSignals = allSignals.filter((s) => !s.flagged);

  return (
    <main className="min-h-screen" style={{ background: "#fdfcf0", color: "#000000" }}>
      <Header>
        <button onClick={() => fetchData(true)} disabled={isRefreshing} className="neo-button bg-neo-green text-xs font-bold flex items-center gap-2">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </Header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* ===== HERO ===== */}
        <section className="flex flex-col lg:flex-row items-start gap-8 pb-8" style={{ borderBottom: "3px solid black" }}>
          <div className="flex items-center gap-5">
            <img src={profile.avatarUrl} alt="" className="w-20 h-20 rounded-xl border-2" style={{ borderColor: "black" }} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 text-[9px] font-black uppercase bg-neo-yellow text-black border-2 border-black">Deterministic</span>
                <span className="px-2 py-0.5 text-[9px] font-black uppercase bg-neo-pink text-white border-2 border-black">Beta</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-heading text-black">{username}</h1>
              <p className="text-sm text-gray-600 mt-1">{interp.headline}</p>
            </div>
          </div>
          <div className="flex gap-6 lg:ml-auto">
            <div className="text-center">
              <div className="text-6xl font-heading text-yellow-600 leading-none">{score}</div>
              <div className="text-[10px] font-heading uppercase text-gray-500 mt-1">Score</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-heading text-cyan-700 leading-none">{interp.overall.grade}</div>
              <div className="text-[10px] font-heading uppercase text-gray-500 mt-1">Grade</div>
            </div>
          </div>
        </section>

        {/* ===== NAV TABS ===== */}
        <nav className="flex gap-1 p-1 rounded-xl" style={{ background: "#e8e6d8", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
          {[["overview", "Overview"], ["scores", "Scores"], ["charts", "Charts"], ["signals", "Signals"], ["meta", "Meta"]].map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key as typeof activeTab)} className={`flex-1 py-2 px-3 rounded-lg text-xs font-heading uppercase transition-all ${activeTab === key ? "bg-neo-yellow text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "text-gray-500 hover:text-black hover:bg-[#e8e6d8]"}`}>{label}</button>
          ))}
        </nav>

        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === "overview" && <OverviewTab data={data} />}

        {/* ===== SCORES TAB ===== */}
        {activeTab === "scores" && <ScoresTab data={data} />}

        {/* ===== CHARTS TAB ===== */}
        {activeTab === "charts" && <ChartsTab charts={charts} />}

        {/* ===== SIGNALS TAB ===== */}
        {activeTab === "signals" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-heading text-black flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-yellow-600" /> Anomaly Signals ({flaggedSignals.length} flagged / {allSignals.length} total)</h2>
              <div className="flex gap-2">
                <button onClick={() => setExpandedSignals(new Set(allSignals.map((s) => s.id)))} className="px-3 py-1 rounded text-[10px] font-heading uppercase" style={{ background: "#e0f7fa", border: "3px solid black", color: "#22d3ee" }}>Expand All</button>
                <button onClick={() => setExpandedSignals(new Set())} className="px-3 py-1 rounded text-[10px] font-heading uppercase" style={{ background: "#e8e6d8", border: "3px solid black", color: "#94a3b8" }}>Collapse All</button>
              </div>
            </div>
            {/* Signal filter */}
            <div className="flex gap-3">
              <div className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-pink-700" /><span className="text-gray-600">Flagged ({flaggedSignals.length})</span></div>
              <div className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-slate-600" /><span className="text-gray-600">Clean ({unflaggedSignals.length})</span></div>
              <div className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-yellow-600" /><span className="text-gray-600">Sampled</span></div>
              <div className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-gray-300" /><span className="text-gray-600">Unavailable</span></div>
            </div>
            {flaggedSignals.length > 0 && (
              <div className="space-y-2">
                {flaggedSignals.map((s) => <SignalRow key={s.id} signal={s} expanded={expandedSignals.has(s.id)} onToggle={() => toggleSignal(s.id)} flagged />)}
              </div>
            )}
            {unflaggedSignals.length > 0 && (
              <div className="mt-6 space-y-2">
                <h3 className="text-sm font-heading text-gray-500 uppercase">Unflagged ({unflaggedSignals.length})</h3>
                {unflaggedSignals.map((s) => <SignalRow key={s.id} signal={s} expanded={expandedSignals.has(s.id)} onToggle={() => toggleSignal(s.id)} flagged={false} />)}
              </div>
            )}
          </div>
        )}

        {/* ===== META TAB ===== */}
        {activeTab === "meta" && <MetaTab data={data} expandedBaselines={expandedBaselines} setExpandedBaselines={setExpandedBaselines} />}
      </div>
    </main>
  );
}

/* ================================================================
   OVERVIEW TAB
   ================================================================ */
function OverviewTab({ data }: { data: EngineResult }) {
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
            {/* Hourly bar chart */}
            <div className="flex items-end gap-px h-12 mt-2">
              {ip.workRhythm.hourly.map((h) => (
                <div key={h.hour} className="flex-1 rounded-t" style={{ height: `${Math.max(2, h.share * 200)}%`, background: h.hour === ip.workRhythm.peakHourUtc ? "#a855f7" : "rgba(168,85,247,0.25)" }} title={`${h.hour}:00 UTC - ${(h.share * 100).toFixed(1)}%`} />
              ))}
            </div>
            <div className="flex justify-between text-[8px] text-gray-400"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
            {/* Daily */}
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
        {/* Rule status breakdown */}
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

/* ================================================================
   SCORES TAB
   ================================================================ */
function ScoresTab({ data }: { data: EngineResult }) {
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
                  <div className="h-full rounded-full" style={{ width: `${(r.value as number)}%`, background: gradeColor(ip.grades.find((g) => g.id === r.id)?.grade ?? "C") }} />
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
                <span className="text-gray-400">Rel:{r.releases}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ================================================================
   CHARTS TAB
   ================================================================ */
/* eslint-disable @typescript-eslint/no-explicit-any */
function ChartsTab({ charts }: { charts: Record<string, ChartResult> }) {
  // Extract chart values outside JSX to avoid SWC angle-bracket parse errors
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
      {/* Contribution Heatmap (4.1) */}
      {charts["4.1"] && <ChartSection title="Contribution Calendar" chart={charts["4.1"]}>
        <ContributionHeatmap days={v("4.1")} />
      </ChartSection>}

      {/* Punch Card (4.4) */}
      {charts["4.4"] && <ChartSection title="Punch Card" chart={charts["4.4"]}>
        <PunchCard cells={v("4.4")} />
      </ChartSection>}

      {/* Language Distribution (4.5) */}
      {charts["4.5"] && <ChartSection title="Language Distribution" chart={charts["4.5"]}>
        <LanguageDonut items={v("4.5")} />
      </ChartSection>}

      {/* Score Radar (4.13) */}
      {charts["4.13"] && <ChartSection title="Score Radar" chart={charts["4.13"]}>
        <MiniRadar items={v("4.13")} />
      </ChartSection>}

      {/* Commit Activity (4.2) */}
      {charts["4.2"] && <ChartSection title="Commit Activity (52 weeks)" chart={charts["4.2"]}>
        <BarChartSimple items={v("4.2")} />
      </ChartSection>}

      {/* Code Frequency (4.3) */}
      {charts["4.3"] && <ChartSection title="Additions vs Deletions" chart={charts["4.3"]}>
        <DivergingBars items={v("4.3")} />
      </ChartSection>}

      {/* Repo Size vs Stars (4.6) */}
      {charts["4.6"] && <ChartSection title="Repository Size vs Stars" chart={charts["4.6"]}>
        <ScatterPlot items={v("4.6")} />
      </ChartSection>}

      {/* PR Issue Funnel (4.9) */}
      {charts["4.9"] && <ChartSection title="PR & Issue Funnel" chart={charts["4.9"]}>
        <Funnel items={v("4.9")} />
      </ChartSection>}

      {/* Weekend Split (4.12) */}
      {charts["4.12"] && <ChartSection title="Weekday vs Weekend" chart={charts["4.12"]}>
        <PieSimple items={v("4.12")} />
      </ChartSection>}

      {/* Event Mix (4.22) */}
      {charts["4.22"] && <ChartSection title="Event Type Mix (30 days)" chart={charts["4.22"]}>
        <PieSimple items={v("4.22")} labelKey="type" />
      </ChartSection>}

      {/* Lorenz Curve (4.29) */}
      {charts["4.29"] && <ChartSection title="Star Inequality (Lorenz Curve)" chart={charts["4.29"]}>
        <LorenzCurve data={v("4.29")} />
      </ChartSection>}

      {/* Repo Lifetime Gantt (4.30) */}
      {charts["4.30"] && <ChartSection title="Repository Lifetimes" chart={charts["4.30"]}>
        <GanttChart items={v("4.30")} />
      </ChartSection>}

      {/* Contribution Split (4.20) */}
      {charts["4.20"] && <ChartSection title="Contributions by Repository" chart={charts["4.20"]}>
        <BarChartHorizontal items={(v("4.20") as any[]).slice(0, 15)} />
      </ChartSection>}

      {/* Streak Timeline (4.7) */}
      {charts["4.7"] && <ChartSection title="Streak Timeline" chart={charts["4.7"]}>
        <StreakTimeline segments={v("4.7")} />
      </ChartSection>}

      {/* Burst Overlay (4.8) */}
      {charts["4.8"] && <ChartSection title="Burst Annotation Overlay" chart={charts["4.8"]}>
        <BurstOverlay data={v("4.8")} />
      </ChartSection>}

      {/* Repo Creation Timeline (4.11) */}
      {charts["4.11"] && <ChartSection title="Repository Creation Timeline" chart={charts["4.11"]}>
        <RepoCreationTimeline items={v("4.11")} />
      </ChartSection>}

      {/* PR Merge Histogram (4.17) */}
      {charts["4.17"] && <ChartSection title="PR Merge Time" chart={charts["4.17"]}>
        <HistogramChart items={v("4.17")} unit="hrs" />
      </ChartSection>}

      {/* Issue Response Histogram (4.18) */}
      {charts["4.18"] && <ChartSection title="Issue First-Response Latency" chart={charts["4.18"]}>
        <HistogramChart items={v("4.18")} unit="hrs" />
      </ChartSection>}

      {/* Commit Size Histogram (4.19) */}
      {charts["4.19"] && <ChartSection title="Commit Size Distribution" chart={charts["4.19"]}>
        <HistogramChart items={v("4.19")} unit="lines" />
      </ChartSection>}

      {/* Language x Repo Heatmap (4.31) */}
      {charts["4.31"] && <ChartSection title="Language by Repository" chart={charts["4.31"]}>
        <LanguageRepoHeatmap data={v("4.31")} />
      </ChartSection>}

      {/* Security Severities (4.28) */}
      {charts["4.28"] && <ChartSection title="Security Alert Severities" chart={charts["4.28"]}>
        <SecuritySeverities data={v("4.28")} />
      </ChartSection>}

      {/* Dependency Ecosystems (4.27) */}
      {charts["4.27"] && <ChartSection title="Dependency Ecosystems" chart={charts["4.27"]}>
        <PieSimple items={(v("4.27") as any[]).map((e: any) => ({ label: e.ecosystem, value: e.value }))} />
      </ChartSection>}

      {/* Cumulative Star History (4.15) */}
      {charts["4.15"] && <ChartSection title="Cumulative Star History" chart={charts["4.15"]}>
        <StarHistory data={v("4.15")} />
      </ChartSection>}

      {/* Star Velocity (4.16) */}
      {charts["4.16"] && <ChartSection title="Star Velocity (Stars/Month)" chart={charts["4.16"]}>
        <BarChartSimple items={(v("4.16") as any[]).map((i: any) => ({ week: i.month, commits: i.stars }))} />
      </ChartSection>}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ================================================================
   META TAB
   ================================================================ */
function MetaTab({ data, expandedBaselines, setExpandedBaselines }: { data: EngineResult; expandedBaselines: boolean; setExpandedBaselines: (v: boolean) => void }) {
  const { meta, baseline } = data;
  return (
    <div className="space-y-6">
      {/* Engine Info */}
      <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <h2 className="text-lg font-heading text-black mb-4 flex items-center gap-2"><Cpu className="w-5 h-5 text-cyan-700" /> Engine Metadata</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetaCard label="Auth Tier" value={meta.authTier} color="cyan" />
          <MetaCard label="Mode" value={meta.analysisMode} color="purple" />
          <MetaCard label="API Version" value={meta.apiVersion} color="yellow" />
          <MetaCard label="Timestamp" value={new Date(meta.timestamp).toLocaleString()} color="slate" />
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
                <div className="h-full rounded-full" style={{ width: `${(b.used / b.limit) * 100}%`, background: b.remaining === 0 ? "#ef4444" : "#22d3ee" }} />
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
        <button onClick={() => setExpandedBaselines(!expandedBaselines)} className="flex items-center gap-2 text-sm font-heading text-black w-full">
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

/* ================================================================
   CHART COMPONENTS
   ================================================================ */

function ContributionHeatmap({ days }: { days: Array<{ date: string; count: number; weekday: number; week: number }> }) {
  const maxCount = Math.max(1, ...days.map((d) => d.count));
  const cellSize = 11;
  const gap = 2;
  const weeks = Math.max(...days.map((d) => d.week)) + 1;
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

function PunchCard({ cells }: { cells: Array<{ day: number; hour: number; count: number }> }) {
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

function LanguageDonut({ items }: { items: Array<{ language: string; bytes: number; share: number }> }) {
  const colors = ["#06b6d4", "#facc15", "#ec4899", "#22c55e", "#a855f7", "#f97316", "#3b82f6", "#ef4444", "#14b8a6", "#8b5cf6"];
  const top = items.slice(0, 10);
  const total = top.reduce((s, i) => s + i.share, 0);
  let cumAngle = -Math.PI / 2;
  const cx = 90, cy = 90, r = 70, innerR = 42;
  return (
    <div className="flex items-center gap-6">
      <svg width={180} height={180}>
        {top.map((item, i) => {
          const angle = (item.share / total) * Math.PI * 2;
          const startAngle = cumAngle;
          cumAngle += angle;
          const endAngle = cumAngle;
          const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
          const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
          const ix1 = cx + innerR * Math.cos(startAngle), iy1 = cy + innerR * Math.sin(startAngle);
          const ix2 = cx + innerR * Math.cos(endAngle), iy2 = cy + innerR * Math.sin(endAngle);
          const largeArc = angle > Math.PI ? 1 : 0;
          const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
          return <path key={i} d={d} fill={colors[i % colors.length]} opacity={0.85} />;
        })}
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

function ScoreRadar({ breakdown, weights }: { breakdown: Record<string, RuleResult<number | Record<string, unknown>>>; weights: Record<string, number> }) {
  const items = Object.values(breakdown).filter((r) => r.id !== "2.7" && typeof r.value === "number").map((r) => ({ id: r.id, label: r.name.replace(/ score$/i, ""), value: Number(r.value), weight: weights[r.id] ?? 0 }));
  return <MiniRadar items={items} />;
}

function MiniRadar({ items }: { items: Array<{ id: string; label: string; value: number; weight: number }> }) {
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

function BarChartSimple({ items }: { items: Array<{ week: string; commits: number }> }) {
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

function DivergingBars({ items }: { items: Array<{ week: string; additions: number; deletions: number }> }) {
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

function ScatterPlot({ items }: { items: Array<{ repository: string; logSize: number; logStars: number; fork: boolean }> }) {
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

function Funnel({ items }: { items: Array<{ stage: string; value: number }> }) {
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

function PieSimple({ items, labelKey = "label" }: { items: Array<Record<string, string | number>>; labelKey?: string }) {
  const colors = ["#06b6d4", "#facc15", "#ec4899", "#22c55e", "#a855f7", "#f97316", "#3b82f6", "#ef4444"];
  const total = items.reduce((s, i) => s + (typeof i.value === "number" ? i.value : 0), 0) || 1;
  let cumAngle = -Math.PI / 2;
  const cx = 70, cy = 70, r = 60, innerR = 35;
  return (
    <div className="flex items-center gap-4">
      <svg width={140} height={140}>
        {items.map((item, i) => {
          const val = typeof item.value === "number" ? item.value : 0;
          const angle = (val / total) * Math.PI * 2;
          const startAngle = cumAngle;
          cumAngle += angle;
          const endAngle = cumAngle;
          const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
          const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
          const ix1 = cx + innerR * Math.cos(startAngle), iy1 = cy + innerR * Math.sin(startAngle);
          const ix2 = cx + innerR * Math.cos(endAngle), iy2 = cy + innerR * Math.sin(endAngle);
          const largeArc = angle > Math.PI ? 1 : 0;
          const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
          return <path key={i} d={d} fill={colors[i % colors.length]} opacity={0.8} />;
        })}
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

function LorenzCurve({ data }: { data: { points: Array<{ populationShare: number; starShare: number }>; gini: number } }) {
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

function GanttChart({ items }: { items: Array<{ repository: string; start: string; end: string; dormant: boolean; archived: boolean }> }) {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 20);
  if (!sorted.length) return null;
  const minTime = new Date(sorted[0].start).getTime();
  const maxTime = Math.max(Date.now(), ...sorted.map((i) => new Date(i.end).getTime()));
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

function BarChartHorizontal({ items }: { items: Array<{ repository: string; count: number }> }) {
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

function StreakTimeline({ segments }: { segments: Array<{ active: boolean; start: string; end: string; days: number }> }) {
  const totalDays = segments.reduce((s, seg) => s + seg.days, 0) || 1;
  return (
    <div className="flex h-6 rounded overflow-hidden">
      {segments.map((seg, i) => (
        <div key={i} style={{ width: `${(seg.days / totalDays) * 100}%` }} className={`${seg.active ? "bg-cyan-700" : "bg-gray-300"}`} title={`${seg.active ? "Active" : "Inactive"}: ${seg.days}d (${seg.start} to ${seg.end})`} />
      ))}
    </div>
  );
}

function BurstOverlay({ data }: { data: Array<{ date: string; count: number; rolling7: number; z: number; burst: boolean }> }) {
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

function RepoCreationTimeline({ items }: { items: Array<{ repository: string; createdAt: string; fork: boolean; stars: number }> }) {
  const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!sorted.length) return null;
  const minTime = new Date(sorted[0].createdAt).getTime();
  const maxTime = Math.max(Date.now(), ...sorted.map((i) => new Date(i.createdAt).getTime()));
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

function HistogramChart({ items, unit }: { items: Array<{ min: number; max: number; count: number }>; unit: string }) {
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

function LanguageRepoHeatmap({ data }: { data: { languages: string[]; repositories: string[]; cells: Array<{ language: string; repository: string; bytes: number }> } }) {
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

function SecuritySeverities({ data }: { data: { codeScanning: Record<string, number>; dependabot: Record<string, number> } }) {
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

function StarHistory({ data }: { data: Array<{ repository: string; points: Array<{ at: string; cumulative: number }> }> }) {
  if (!data.length) return null;
  const maxStars = Math.max(1, ...data.flatMap((d) => d.points.map((p) => p.cumulative)));
  const allPoints = data.flatMap((d) => d.points);
  if (!allPoints.length) return null;
  const minTime = new Date(allPoints[0].at).getTime();
  const maxTime = new Date(allPoints[allPoints.length - 1].at).getTime();
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

/* ================================================================
   SIGNALS SUMMARY COMPONENT
   ================================================================ */
function SignalsSummary({ signals }: { signals: Record<string, SignalResult> }) {
  const all = Object.values(signals);
  const flagged = all.filter((s) => s.flagged);
  const ok = all.filter((s) => !s.flagged);
  const byCategory: Record<string, { total: number; flagged: number }> = {};
  all.forEach((s) => {
    const cat = s.id.split(".")[0];
    if (!byCategory[cat]) byCategory[cat] = { total: 0, flagged: 0 };
    byCategory[cat].total++;
    if (s.flagged) byCategory[cat].flagged++;
  });
  const categoryNames: Record<string, string> = { "1": "Baseline", "2": "Scoring", "3": "Signals", "4": "Charts" };
  return (
    <section className="rounded-xl p-5" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
      <h2 className="text-lg font-heading text-black mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-yellow-600" /> Signals Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg p-3 text-center" style={{ background: "#f8f7f0", border: "3px solid black" }}>
          <div className="text-2xl font-heading text-black">{all.length}</div>
          <div className="text-[9px] text-gray-500">Total Rules</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "#f0fdf4", border: "3px solid black" }}>
          <div className="text-2xl font-heading text-green-700">{ok.length}</div>
          <div className="text-[9px] text-gray-500">Clean</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "#fce7f3", border: "3px solid black" }}>
          <div className="text-2xl font-heading text-pink-700">{flagged.length}</div>
          <div className="text-[9px] text-gray-500">Flagged</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "#fef9c3", border: "3px solid black" }}>
          <div className="text-2xl font-heading text-yellow-600">{all.length > 0 ? ((flagged.length / all.length) * 100).toFixed(0) : 0}%</div>
          <div className="text-[9px] text-gray-500">Flag Rate</div>
        </div>
      </div>
      <div className="space-y-2">
        {Object.entries(byCategory).map(([cat, counts]) => (
          <div key={cat} className="flex items-center gap-3">
            <span className="text-[10px] font-heading text-gray-500 w-24 shrink-0">{categoryNames[cat] ?? cat}</span>
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#e8e6d8" }}>
              <div className="h-full flex">
                {counts.total > 0 && (
                  <div className="h-full bg-green-500/60" style={{ width: `${((counts.total - counts.flagged) / counts.total) * 100}%` }} />
                )}
                {counts.flagged > 0 && (
                  <div className="h-full bg-pink-500/60" style={{ width: `${(counts.flagged / counts.total) * 100}%` }} />
                )}
              </div>
            </div>
            <span className="text-[9px] text-gray-400 w-16 text-right shrink-0">{counts.total - counts.flagged} clean / {counts.flagged} flagged</span>
          </div>
        ))}
      </div>
      {flagged.length > 0 && (
        <div className="mt-4 space-y-1">
          <div className="text-[10px] font-heading uppercase text-pink-700/60 mb-2">Top Flagged</div>
          {flagged.slice(0, 5).map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[10px] rounded px-2 py-1" style={{ background: "#fce7f3" }}>
              <span className="text-pink-700 w-8 shrink-0">{s.id}</span>
              <span className="text-gray-700 flex-1 truncate">{s.name}</span>
              <span className="text-pink-700/60 shrink-0">{s.source}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ================================================================
   BASELINE STATS COMPONENT
   ================================================================ */
function BaselineStats({ data }: { data: EngineResult }) {
  const { baseline: bl } = data;
  // Safely extract from any baseline rule value
  const r = (id: string) => bl[id];
  const val = (id: string) => r(id)?.value;
  const num = (id: string, fallback = 0): number => {
    const v = val(id);
    if (typeof v === "number") return v;
    if (typeof v === "object" && v !== null) {
      // Try common nested keys
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
  // Rule 1.1 returns { days, years }
  const ageDays = num("1.1");
  const ageYears = typeof val("1.1") === "object" && val("1.1") !== null ? (val("1.1") as Record<string, unknown>).years : null;
  const ageLabel = ageYears != null ? `${ageYears}y` : `${Math.round(ageDays / 365)}y ${Math.round(ageDays % 365)}d`;
  // Rule 1.3 returns { original, forks, originalRatio }
  const origVal = val("1.3");
  const origRatio = typeof origVal === "object" && origVal !== null ? (origVal as Record<string, unknown>).originalRatio : null;
  // Rule 1.7 returns { raw, capped, cap }
  const ffwVal = val("1.7");
  const ffRatio = typeof ffwVal === "object" && ffwVal !== null ? (ffwVal as Record<string, unknown>).capped : null;
  // Rule 1.8 returns { distinct, effectiveDiversity, totalBytes }
  const langVal = val("1.8");
  const langDistinct = typeof langVal === "object" && langVal !== null ? (langVal as Record<string, unknown>).distinct : null;
  // Rule 1.11 returns { opened, merged } or unavailable
  const prVal = val("1.11");
  const prsOpened = typeof prVal === "object" && prVal !== null ? (prVal as Record<string, unknown>).opened : null;
  // Rule 1.12 returns { opened, closed } or unavailable
  const issVal = val("1.12");
  const issOpened = typeof issVal === "object" && issVal !== null ? (issVal as Record<string, unknown>).opened : null;
  // Rule 1.14 returns { longest, current }
  const streakVal = val("1.14");
  const longest = typeof streakVal === "object" && streakVal !== null ? (streakVal as Record<string, unknown>).longest : null;
  const currentStreak = typeof streakVal === "object" && streakVal !== null ? (streakVal as Record<string, unknown>).current : null;
  // Rule 1.15 returns { activeDays, observedDays, ratio }
  const adVal = val("1.15");
  const adRatio = typeof adVal === "object" && adVal !== null ? (adVal as Record<string, unknown>).ratio : null;
  // Rule 1.19 returns { present, bytes }
  const readmeVal = val("1.19");
  const readmePresent = typeof readmeVal === "object" && readmeVal !== null ? (readmeVal as Record<string, unknown>).present : null;
  // Rule 1.20 returns { count, totalStars, items }
  const pinnedVal = val("1.20");
  const pinnedCount = typeof pinnedVal === "object" && pinnedVal !== null ? (pinnedVal as Record<string, unknown>).count : null;
  // Rule 1.24 returns { count, total, fields }
  const completeVal = val("1.24");
  const completeCount = typeof completeVal === "object" && completeVal !== null ? (completeVal as Record<string, unknown>).count : null;
  const completeTotal = typeof completeVal === "object" && completeVal !== null ? (completeVal as Record<string, unknown>).total : null;
  // Rule 1.25 returns array of repo release objects
  const relVal = val("1.25");
  const totalReleases = Array.isArray(relVal) ? relVal.reduce((s: number, item: Record<string, unknown>) => s + (typeof item.count === "number" ? item.count : 0), 0) : null;
  // Rule 1.28 returns { archived, disabled, archivedRatio, disabledRatio }
  const archVal = val("1.28");
  const archivedCount = typeof archVal === "object" && archVal !== null ? (archVal as Record<string, unknown>).archived : null;
  // Rule 1.29 returns { count, repositories }
  const templVal = val("1.29");
  const templCount = typeof templVal === "object" && templVal !== null ? (templVal as Record<string, unknown>).count : null;
  // Rule 1.31 returns { years, activeYearCount, span }
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

/* ================================================================
   SHARED COMPONENTS
   ================================================================ */

function ScoreCard({ label, value, weight, grade }: { label: string; value: number; weight: number; grade?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "#e8e6d8", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-heading uppercase text-gray-500 truncate">{label}</span>
        {grade && <span className="text-[10px] font-heading" style={{ color: gradeColor(grade) }}>{grade}</span>}
      </div>
      <div className="text-xl font-heading text-black">{typeof value === "number" ? value.toFixed(1) : value}</div>
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-1 rounded-full" style={{ background: "#e8e6d8" }}>
          <div className="h-full rounded-full bg-cyan-700" style={{ width: `${Math.min(100, value)}%` }} />
        </div>
        <span className="text-[9px] text-gray-400">{(weight * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function GradeRow({ grade }: { grade: InterpretationGrade }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-8 text-center text-sm font-heading" style={{ color: gradeColor(grade.grade) }}>{grade.grade}</span>
      <span className="text-xs text-gray-700 flex-1">{grade.label}</span>
      <span className="text-[10px] text-gray-500">{grade.score}/100</span>
    </div>
  );
}

function SignalRow({ signal, expanded, onToggle, flagged }: { signal: SignalResult; expanded: boolean; onToggle: () => void; flagged: boolean }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ background: flagged ? "#fce7f3" : "white", border: flagged ? "3px solid black" : "2px solid black" }}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-2 text-left">
        {flagged ? <AlertTriangle className="w-3 h-3 text-pink-700 shrink-0" /> : <CheckCircle className="w-3 h-3 text-gray-400 shrink-0" />}
        <span className="text-[10px] text-cyan-700 w-8 shrink-0">{signal.id}</span>
        <span className={`text-xs flex-1 ${flagged ? "text-pink-300" : "text-gray-600"}`}>{signal.name}</span>
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

function StatusBadge({ status }: { status: string }) {
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

function MetaCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = { cyan: "text-cyan-700", purple: "text-purple-600", yellow: "text-yellow-600", green: "text-green-600", pink: "text-pink-600", slate: "text-gray-600" };
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: "#f8f7f0", border: "3px solid black" }}>
      <div className={`text-sm font-heading ${colorMap[color] ?? "text-gray-600"}`}>{value}</div>
      <div className="text-[9px] text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: "#f8f7f0", border: "3px solid black" }}>
      <div className="text-lg font-heading text-black">{value}</div>
      <div className="text-[9px] text-gray-500">{label}</div>
      <div className="text-[8px] text-gray-400">{sub}</div>
    </div>
  );
}

function ChartSection({ title, chart, children }: { title: string; chart: ChartResult; children: React.ReactNode }) {
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

function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "#22c55e";
  if (grade === "B") return "#06b6d4";
  if (grade === "C") return "#facc15";
  if (grade === "D") return "#f97316";
  return "#ef4444";
}
