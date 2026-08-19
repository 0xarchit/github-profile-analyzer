"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { RefreshCw, Cpu, Activity, XCircle } from "lucide-react";
import type { EngineResult, AnalysisProgressEvent } from "@/lib/deterministic";

import { OverviewTab } from "./tabs/OverviewTab";
import { ScoresTab } from "./tabs/ScoresTab";
import { ChartsTab } from "./tabs/ChartsTab";
import { SignalsTab } from "./tabs/SignalsTab";
import { MetaTab } from "./tabs/MetaTab";

interface Props { username: string; }

const PHASE_LABELS: Record<string, string> = {
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
const PHASE_ORDER = Object.keys(PHASE_LABELS);

type TabKey = "overview" | "scores" | "charts" | "signals" | "meta";
const TABS: [TabKey, string][] = [["overview", "Overview"], ["scores", "Scores"], ["charts", "Charts"], ["signals", "Signals"], ["meta", "Meta"]];

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
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [elapsed, setElapsed] = useState(0);

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
        } catch { /* ignore parse errors */ }
      });
      es.addEventListener("complete", async (e) => {
        try {
          const r = JSON.parse(e.data) as EngineResult;
          setData(r);
          setError(null);
          es.close();
          const confetti = (await import("canvas-confetti")).default;
          confetti({ particleCount: 120, spread: 60, origin: { y: 0.6 }, colors: ["#06b6d4", "#facc15", "#ec4899", "#22c55e"] });
        } catch { /* ignore */ }
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

  useEffect(() => {
    if (data || error) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [data, error]);

  const toggleSignal = useCallback((id: string) => {
    setExpandedSignals((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  // --- LOADING ---
  if (!data && !error) return <LoadingScreen username={username} currentPhase={currentPhase} budget={budget} progress={progress} elapsed={elapsed} />;

  // --- ERROR ---
  if (error) return <ErrorScreen error={error} router={router} />;

  if (!data) return null;

  const { scores, interpretation: interp, charts } = data;
  return (
    <main className="min-h-screen" style={{ background: "#fdfcf0", color: "#000000" }}>
      <Header>
        <button onClick={() => fetchData(true)} disabled={isRefreshing} className="neo-button bg-neo-green text-xs font-bold flex items-center gap-2">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </Header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* HERO */}
        <section className="flex flex-col lg:flex-row items-start gap-8 pb-8" style={{ borderBottom: "3px solid black" }}>
          <div className="flex items-center gap-5">
            <img src={data.profile.avatarUrl} alt="" className="w-20 h-20 rounded-xl border-2" style={{ borderColor: "black" }} />
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
              <div className="text-6xl font-heading text-yellow-600 leading-none">{scores.finalScore}</div>
              <div className="text-[10px] font-heading uppercase text-gray-500 mt-1">Score</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-heading text-cyan-700 leading-none">{interp.overall.grade}</div>
              <div className="text-[10px] font-heading uppercase text-gray-500 mt-1">Grade</div>
            </div>
          </div>
        </section>

        {/* NAV TABS */}
        <nav className="flex gap-1 p-1 rounded-xl" style={{ background: "#e8e6d8", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`flex-1 py-2 px-3 rounded-lg text-xs font-heading uppercase transition-all ${activeTab === key ? "bg-neo-yellow text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "text-gray-500 hover:text-black hover:bg-[#e8e6d8]"}`}>{label}</button>
          ))}
        </nav>

        {/* TAB CONTENT */}
        {activeTab === "overview" && <OverviewTab data={data} />}
        {activeTab === "scores" && <ScoresTab data={data} />}
        {activeTab === "charts" && <ChartsTab charts={charts} />}
        {activeTab === "signals" && <SignalsTab data={data} expandedSignals={expandedSignals} toggleSignal={toggleSignal} />}
        {activeTab === "meta" && <MetaTab data={data} expandedBaselines={expandedBaselines} setExpandedBaselines={setExpandedBaselines} />}
      </div>
    </main>
  );
}

/* ================================================================
   LOADING SCREEN
   ================================================================ */
function LoadingScreen({ username, currentPhase, budget, progress, elapsed }: {
  username: string;
  currentPhase: string;
  budget: { rest: number; graphql: number; search: number };
  progress: AnalysisProgressEvent[];
  elapsed: number;
}) {
  const currentPhaseIdx = PHASE_ORDER.indexOf(currentPhase);
  const totalCalls = budget.rest + budget.graphql + budget.search;
  const recentProgress = progress.slice(-8);

  return (
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
            {PHASE_ORDER.map((phase, i) => (
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
                {PHASE_LABELS[currentPhase] || currentPhase || "Initializing"}
              </span>
              <span className="text-[10px] text-gray-500">{totalCalls} API calls | {elapsed}s elapsed</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#e8e6d8" }}>
              <div className="h-full rounded-full transition-all duration-700" style={{
                width: currentPhaseIdx >= 0 ? `${((currentPhaseIdx + 1) / PHASE_ORDER.length) * 100}%` : "5%",
                background: "linear-gradient(90deg, #0891b2, #7c3aed)"
              }} />
            </div>
            <div className="flex justify-between">
              {PHASE_ORDER.filter((_, i) => i % 3 === 0).map((phase, i) => (
                <span key={phase} className={`text-[7px] ${i <= currentPhaseIdx / 3 ? "text-cyan-700/60" : "text-gray-400"}`}>{PHASE_LABELS[phase]?.slice(0, 14)}</span>
              ))}
            </div>
          </div>

          {/* Budget counters */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[ ["REST", budget.rest, "text-cyan-700", "#e0f7fa"], ["GraphQL", budget.graphql, "text-purple-600", "#f3e8ff"], ["Search", budget.search, "text-yellow-600", "#fef9c3"] ].map(([label, val, tc, bg]) => (
              <div key={label as string} className="rounded-lg p-3" style={{ background: bg, border: "3px solid black", boxShadow: '3px 3px 0px 0px rgba(0,0,0,1)' }}>
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
}

/* ================================================================
   ERROR SCREEN
   ================================================================ */
function ErrorScreen({ error, router }: { error: string; router: ReturnType<typeof useRouter> }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#fdfcf0" }}>
      <div className="max-w-md w-full text-center space-y-6 rounded-xl p-8" style={{ background: "white", border: "3px solid black", boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <XCircle className="w-16 h-16 text-pink-700 mx-auto" />
        <h2 className="text-3xl font-heading uppercase text-black">Engine Failure</h2>
        <p className="text-sm text-black font-mono">{error}</p>
        <button onClick={() => router.push("/")} className="w-full py-3 neo-button bg-neo-yellow font-bold text-sm">Return to Hub</button>
      </div>
    </div>
  );
}
