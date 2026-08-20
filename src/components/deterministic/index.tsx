"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { RefreshCw, Activity, XCircle, Star, ShieldCheck, Lock } from "lucide-react";
import type { StoredEngineResult, AnalysisProgressEvent, AnalysisMode } from "@/lib/deterministic";
import { fetchAuthIdentity } from "@/lib/client-auth";

import { OverviewTab } from "./tabs/OverviewTab";
import { ScoresTab } from "./tabs/ScoresTab";
import { ChartsTab } from "./tabs/ChartsTab";
import { SignalsTab } from "./tabs/SignalsTab";
import { MetaTab } from "./tabs/MetaTab";

interface Props {
  username: string;
  initialData?: StoredEngineResult | null;
}

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
const TABS: [TabKey, string][] = [
  ["overview", "Overview"],
  ["scores", "Scores"],
  ["charts", "Charts"],
  ["signals", "Signals"],
  ["meta", "Meta"],
];

export function DeterministicProfileClient({ username, initialData }: Props) {
  const router = useRouter();
  const [data, setData] = useState<StoredEngineResult | null>(initialData || null);
  const [error, setError] = useState<string | null>(null);
  const [showStarModal, setShowStarModal] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isVerifyingAgain, setIsVerifyingAgain] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMode, setSelectedMode] = useState<AnalysisMode>(initialData?.meta?.analysisMode || "deep");
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalysisProgressEvent[]>([]);
  const [currentPhase, setCurrentPhase] = useState("");
  const [budget, setBudget] = useState({ rest: 0, graphql: 0, search: 0 });
  const [expandedSignals, setExpandedSignals] = useState<Set<string>>(new Set());
  const [expandedBaselines, setExpandedBaselines] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [elapsed, setElapsed] = useState(0);

  const esRef = useRef<EventSource | null>(null);

  // Close EventSource on unmount
  useEffect(() => {
    return () => {
      const active = esRef.current;
      esRef.current = null;
      active?.close();
    };
  }, []);

  const fetchData = useCallback(
    async (force = false, modeToUse: AnalysisMode = selectedMode) => {
      try {
        const prev = esRef.current;
        esRef.current = null;
        prev?.close();

        setIsRefreshing(force);
        setError(null);
        setProgress([]);
        if (force) {
          setData(null);
          setElapsed(0);
        }
        const url = `/api/analyze/deterministic/stream?username=${encodeURIComponent(username)}&mode=${modeToUse}${force ? "&force=true" : ""}`;
        const es = new EventSource(url);
        esRef.current = es;

        es.addEventListener("progress", (e) => {
          if (esRef.current !== es) return;
          try {
            const ev = JSON.parse(e.data) as AnalysisProgressEvent;
            setProgress((p) => [...p.slice(-30), ev]);
            setCurrentPhase(ev.phase);
            setBudget({
              rest: ev.budget.rest.used,
              graphql: ev.budget.graphql.used,
              search: ev.budget.search.used,
            });
          } catch {
            /* ignore parse errors */
          }
        });

        es.addEventListener("complete", async (e) => {
          if (esRef.current !== es) return;
          setIsRefreshing(false);
          try {
            const r = JSON.parse(e.data) as StoredEngineResult;
            setData(r);
            setError(null);
            esRef.current = null;
            es.close();
            const confetti = (await import("canvas-confetti")).default;
            confetti({
              particleCount: 120,
              spread: 60,
              origin: { y: 0.6 },
              colors: ["#06b6d4", "#facc15", "#ec4899", "#22c55e"],
            });
          } catch {
            setError("ANALYSIS_FAILURE");
            esRef.current = null;
            es.close();
          }
        });

        es.addEventListener("analysis-error", (e) => {
          if (esRef.current !== es) return;
          setIsRefreshing(false);
          try {
            const payload = JSON.parse((e as MessageEvent).data || "{}");
            if (payload.error === "Star required" || payload.showPopup) {
              setShowStarModal(true);
            } else {
              setError(payload.message || payload.error || "Analysis failed");
            }
          } catch {
            setError("ANALYSIS_FAILURE");
          }
          esRef.current = null;
          es.close();
        });

        es.onerror = () => {
          if (esRef.current !== es) return;
          setError("NETWORK_FAILURE");
          setIsRefreshing(false);
          esRef.current = null;
          es.close();
        };
      } catch {
        setIsRefreshing(false);
        setError("NETWORK_FAILURE");
      }
    },
    [username, selectedMode],
  );

  const invalidUsername = !username || username.toLowerCase() === "undefined" || username.toLowerCase() === "null";



  const initialLoadInitiatedRef = useRef<string | null>(null);

  useEffect(() => {
    if (invalidUsername) return;
    const safeUsername = (username || "").toLowerCase();

    void fetchAuthIdentity()
      .then((identity) => {
        setIsLoggedIn(Boolean(identity?.username));
        setIsOwner(identity?.username?.toLowerCase() === safeUsername);
      })
      .catch(() => {
        setIsLoggedIn(false);
        setIsOwner(false);
      });

    if (!initialData && initialLoadInitiatedRef.current !== safeUsername) {
      initialLoadInitiatedRef.current = safeUsername;
      void fetchData();
    }
  }, [username, invalidUsername, initialData, fetchData]);

  useEffect(() => {
    if (data || error || showStarModal) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [data, error, showStarModal]);

  const handleRecheckStar = async () => {
    setIsVerifyingAgain(true);
    setStatusNotice(null);
    try {
      const res = await fetch("/api/star-status?username=" + encodeURIComponent(username));
      const resData = await res.json();
      if (resData.isStarred) {
        setShowStarModal(false);
        void fetchData(true);
      } else {
        setStatusNotice("Star not detected yet. Please ensure you have starred the repository.");
      }
    } catch {
      setStatusNotice("Error checking star status. Please try again.");
    } finally {
      setIsVerifyingAgain(false);
    }
  };

  const handleModeChange = (newMode: AnalysisMode) => {
    setStatusNotice(null);
    if (!isLoggedIn && newMode !== "quick") {
      router.push("/api/auth/github");
      return;
    }
    if (!isOwner && newMode === "deep") {
      setStatusNotice("Deep mode is reserved for analyzing your own authenticated profile.");
      return;
    }
    setSelectedMode(newMode);
    void fetchData(true, newMode);
  };

  const toggleSignal = useCallback((id: string) => {
    setExpandedSignals((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  // --- INVALID IDENTIFIER ---
  if (invalidUsername) {
    return <ErrorScreen error="INVALID_ID" router={router} />;
  }

  // --- STAR GATE MODAL ---
  if (showStarModal) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-neo-bg relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "linear-gradient(45deg, black 25%, transparent 25%, transparent 50%, black 50%, black 75%, transparent 75%, transparent)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-40" />
        <div className="neo-card max-w-lg w-full text-center space-y-8 relative z-50 bg-white border-8 border-black shadow-neo-lg p-12">
          <div className="relative inline-block">
            <Star className="w-24 h-24 text-neo-yellow fill-neo-yellow drop-shadow-neo mx-auto animate-bounce" />
            <ShieldCheck className="absolute bottom-0 right-0 w-8 h-8 text-neo-green fill-white" />
          </div>
          <div className="space-y-4">
            <h2 className="text-4xl md:text-5xl font-heading uppercase tracking-tighter leading-none">
              Star Gate Active
            </h2>
            <p className="font-body text-lg font-bold opacity-70">
              Support the analyzer to unlock{" "}
              <span className="text-neo-pink font-black">{username}</span>&apos;s deterministic shards.
            </p>
            <p className="font-body text-sm opacity-60">
              Star the repository to verify profile access.
            </p>
          </div>

          {statusNotice && (
            <div className="p-3 bg-red-100 border-2 border-red-500 text-red-700 text-xs font-bold uppercase">
              {statusNotice}
            </div>
          )}
          <div className="space-y-3">
            <a
              href="https://github.com/0xarchit/github-profile-analyzer"
              target="_blank"
              rel="noopener noreferrer"
              className="neo-button bg-neo-yellow text-center text-lg py-4 flex items-center justify-center gap-3 group w-full"
            >
              <Star className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              Star Repository
            </a>
            <button
              type="button"
              onClick={handleRecheckStar}
              disabled={isVerifyingAgain}
              className="neo-button bg-neo-green text-center text-lg py-4 w-full disabled:opacity-50 font-bold"
            >
              {isVerifyingAgain ? "Rechecking..." : "Recheck Star Status"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="neo-button bg-neo-pink text-white text-lg py-4 w-full font-bold"
            >
              Return to Hub
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- ERROR ---
  if (error) return <ErrorScreen error={error} router={router} />;

  // --- LOADING ---
  if (!data) {
    return (
      <LoadingScreen
        username={username}
        currentPhase={currentPhase}
        budget={budget}
        progress={progress}
        elapsed={elapsed}
      />
    );
  }

  const { scores, interpretation: interp, charts } = data;
  const isHistorical = data.isHistorical;
  const isProfileLocked = data.isLocked;
  const effectiveMode = (data?.meta?.analysisMode ?? selectedMode) as AnalysisMode;

  return (
    <main className="min-h-screen" style={{ background: "#fdfcf0", color: "#000000" }}>
      <Header>
        <div className="flex items-center gap-3">
          {/* Mode Selector */}
          <div className="hidden sm:flex items-center bg-white border-2 border-black p-0.5 rounded-lg text-xs font-bold">
            {(["quick", "standard", "deep"] as AnalysisMode[]).map((mode) => {
              const isActive = effectiveMode === mode;
              const isLockedMode = !isLoggedIn && mode !== "quick";
              return (
                <button
                  type="button"
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  className={`px-3 py-1 uppercase rounded transition-all flex items-center gap-1 ${
                    isActive
                      ? "bg-black text-white"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  {isLockedMode && <Lock className="w-3 h-3 text-neo-pink" />}
                  {mode}
                </button>
              );
            })}
          </div>

          {(isOwner || !isProfileLocked) && (
            <button
              type="button"
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="neo-button bg-neo-green text-xs font-bold flex items-center gap-2"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
          )}
        </div>
      </Header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {statusNotice && (
          <div className="p-3 bg-yellow-100 border-3 border-black shadow-neo flex items-center justify-between text-xs font-heading uppercase text-black">
            <span>{statusNotice}</span>
            <button onClick={() => setStatusNotice(null)} className="font-bold underline text-[10px]">Dismiss</button>
          </div>
        )}
        {/* HERO */}
        <section
          className="flex flex-col lg:flex-row items-start gap-8 pb-8"
          style={{ borderBottom: "3px solid black" }}
        >
          <div className="flex items-center gap-5">
            <img
              src={data.profile.avatarUrl}
              alt=""
              className="w-20 h-20 rounded-xl border-2"
              style={{ borderColor: "black" }}
            />
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2 py-0.5 text-[9px] font-black uppercase bg-neo-yellow text-black border-2 border-black">
                  Deterministic
                </span>
                <span className="px-2 py-0.5 text-[9px] font-black uppercase bg-neo-pink text-white border-2 border-black">
                  {effectiveMode.toUpperCase()}
                </span>
                {isProfileLocked && (
                  <span className="px-2 py-0.5 text-[9px] font-black uppercase bg-gray-200 text-black border-2 border-black flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Locked Profile
                  </span>
                )}
                {isHistorical && (
                  <span className="px-2 py-0.5 text-[9px] font-black uppercase bg-blue-100 text-blue-900 border-2 border-black">
                    Saved Snapshot
                  </span>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl font-heading text-black">{username}</h1>
              <p className="text-sm text-gray-600 mt-1">{interp.headline}</p>
            </div>
          </div>
          <div className="flex gap-6 lg:ml-auto">
            <div className="text-center">
              <div className="text-6xl font-heading text-yellow-600 leading-none">
                {scores.finalScore}
              </div>
              <div className="text-[10px] font-heading uppercase text-gray-500 mt-1">Score</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-heading text-cyan-700 leading-none">
                {interp.overall.grade}
              </div>
              <div className="text-[10px] font-heading uppercase text-gray-500 mt-1">Grade</div>
            </div>
          </div>
        </section>

        {/* TABS */}
        <nav className="flex gap-2 overflow-x-auto pb-2" style={{ borderBottom: "3px solid black" }}>
          {TABS.map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-xs font-heading uppercase transition-all ${
                activeTab === key
                  ? "bg-black text-white"
                  : "bg-white text-black hover:bg-yellow-100"
              }`}
              style={{
                border: "2px solid black",
                boxShadow: activeTab === key ? "none" : "2px 2px 0px 0px rgba(0,0,0,1)",
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* TAB CONTENT */}
        {activeTab === "overview" && <OverviewTab data={data} />}
        {activeTab === "scores" && <ScoresTab data={data} />}
        {activeTab === "charts" && <ChartsTab charts={charts} />}
        {activeTab === "signals" && (
          <SignalsTab
            data={data}
            expandedSignals={expandedSignals}
            toggleSignal={toggleSignal}
          />
        )}
        {activeTab === "meta" && (
          <MetaTab
            data={data}
            expandedBaselines={expandedBaselines}
            setExpandedBaselines={setExpandedBaselines}
          />
        )}
      </div>
    </main>
  );
}

/* ================================================================
   LOADING SCREEN
   ================================================================ */
function LoadingScreen({
  username,
  currentPhase,
  budget,
  progress,
  elapsed,
}: {
  username: string;
  currentPhase: string;
  budget: { rest: number; graphql: number; search: number };
  progress: AnalysisProgressEvent[];
  elapsed: number;
}) {
  const currentPhaseIdx = PHASE_ORDER.indexOf(currentPhase);
  const totalCalls = budget.rest + budget.graphql + budget.search;
  const recentProgress = progress.slice(-5);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ background: "#fdfcf0" }}>
      <div
        className="max-w-xl w-full rounded-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden"
        style={{ background: "white", border: "3px solid black", boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
      >
        <div className="text-center space-y-2">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono text-cyan-700"
            style={{ background: "#e0f7fa" }}
          >
            <span className="w-2 h-2 rounded-full bg-cyan-700 animate-ping" />
            DETERMINISTIC ENGINE ACTIVE
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading uppercase text-black">
            Analyzing <span className="text-cyan-700">@{username}</span>
          </h2>
          <p className="text-xs text-gray-500">Live GitHub API pipeline telemetry</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-center gap-1.5 mb-3">
            {PHASE_ORDER.map((phase, i) => (
              <div key={phase} className="relative">
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-500 ${
                    i < currentPhaseIdx
                      ? "bg-cyan-700"
                      : i === currentPhaseIdx
                        ? "bg-cyan-700 animate-pulse scale-125"
                        : "bg-gray-300"
                  }`}
                />
                {i === currentPhaseIdx && (
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-cyan-700/50 animate-ping" />
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-heading uppercase text-cyan-700 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                {PHASE_LABELS[currentPhase] || currentPhase || "Initializing"}
              </span>
              <span className="text-[10px] text-gray-500">{totalCalls} API calls | {elapsed}s elapsed</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#e8e6d8" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: currentPhaseIdx >= 0 ? `${((currentPhaseIdx + 1) / PHASE_ORDER.length) * 100}%` : "5%",
                  background: "linear-gradient(90deg, #0891b2, #7c3aed)",
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ["REST", budget.rest, "text-cyan-700", "#e0f7fa"],
              ["GraphQL", budget.graphql, "text-purple-600", "#f3e8ff"],
              ["Search", budget.search, "text-yellow-600", "#fef9c3"],
            ].map(([label, val, tc, bg]) => (
              <div
                key={label as string}
                className="rounded-lg p-3"
                style={{ background: bg, border: "3px solid black", boxShadow: "3px 3px 0px 0px rgba(0,0,0,1)" }}
              >
                <div className={`text-2xl font-heading ${tc}`}>{val as number}</div>
                <div className="text-[10px] font-heading uppercase text-gray-500">{label as string}</div>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {recentProgress.map((ev, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span
                  className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                    ev.kind === "phase"
                      ? "bg-cyan-700"
                      : ev.kind === "retry"
                        ? "bg-yellow-600"
                        : ev.kind === "warning"
                          ? "bg-orange-400"
                          : "bg-slate-600"
                  }`}
                />
                <span className="text-gray-500 font-mono shrink-0 w-14">{ev.kind}</span>
                <span className="text-gray-600 flex-1 leading-tight">{ev.message}</span>
              </div>
            ))}
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
      <div
        className="max-w-md w-full text-center space-y-6 rounded-xl p-8"
        style={{ background: "white", border: "3px solid black", boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
      >
        <XCircle className="w-16 h-16 text-pink-700 mx-auto" />
        <h2 className="text-3xl font-heading uppercase text-black">Engine Failure</h2>
        <p className="text-sm text-black font-mono">{error}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="w-full py-3 neo-button bg-neo-yellow font-bold text-sm"
        >
          Return to Hub
        </button>
      </div>
    </div>
  );
}
