"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import {
  RefreshCw,
  Cpu,
  TrendingUp,
  Shield,
  Activity,
  BarChart3,
  Target,
  AlertTriangle,
} from "lucide-react";
import type { EngineResult, AnalysisProgressEvent } from "@/lib/deterministic";

interface DeterministicProfileClientProps {
  username: string;
}

export function DeterministicProfileClient({ username }: DeterministicProfileClientProps) {
  const router = useRouter();
  const [data, setData] = useState<EngineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgressEvent[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>("");
  const [budget, setBudget] = useState<{ rest: number; graphql: number; search: number }>({ rest: 0, graphql: 0, search: 0 });

  const fetchData = useCallback(
    async (force = false) => {
      try {
        setIsRefreshing(force);
        setError(null);
        setProgress([]);

        const streamUrl = `/api/analyze/deterministic/stream?username=${encodeURIComponent(username)}${force ? "&force=true" : ""}`;
        const eventSource = new EventSource(streamUrl);

        eventSource.addEventListener("progress", (e) => {
          try {
            const event = JSON.parse(e.data) as AnalysisProgressEvent;
            setProgress((prev) => [...prev.slice(-20), event]);
            setCurrentPhase(event.phase);
            setBudget({
              rest: event.budget.rest.used,
              graphql: event.budget.graphql.used,
              search: event.budget.search.used,
            });
          } catch {}
        });

        eventSource.addEventListener("complete", async (e) => {
          try {
            const result = JSON.parse(e.data) as EngineResult;
            setData(result);
            setError(null);
            eventSource.close();

            const confetti = (await import("canvas-confetti")).default;
            confetti({
              particleCount: 100,
              spread: 60,
              origin: { y: 0.6 },
              colors: ["#00F0FF", "#FFE600", "#FF00E5", "#000000"],
            });
          } catch {}
        });

        eventSource.addEventListener("error", (e) => {
          try {
            const payload = JSON.parse((e as MessageEvent).data || "{}");
            setError(payload.error || "Deterministic analysis failed");
          } catch {
            setError("DETERMINISTIC_FAILURE");
          } finally {
            eventSource.close();
          }
        });

        eventSource.onerror = () => {
          eventSource.close();
        };
      } catch {
        setError("NETWORK_FAILURE");
      } finally {
        setIsRefreshing(false);
      }
    },
    [username],
  );

  useEffect(() => {
    const safeUsername = (username || "").toLowerCase();
    if (!username || safeUsername === "undefined" || safeUsername === "null") {
      setError("INVALID_ID_SPEC");
      return;
    }
    void fetchData();
  }, [username, fetchData]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0a0a]">
        <div className="max-w-md w-full text-center space-y-6 bg-[#111] border-4 border-[#00F0FF] p-8">
          <Cpu className="w-16 h-16 text-[#00F0FF] mx-auto" />
          <h2 className="text-4xl font-heading uppercase text-[#FF00E5]">
            Engine Failure
          </h2>
          <div className="p-4 bg-[#1a1a1a] border-4 border-[#00F0FF] font-body font-bold text-[#00F0FF]">
            {error}
          </div>
          <button
            onClick={() => router.push("/")}
            className="w-full py-4 bg-[#00F0FF] text-black font-heading uppercase font-bold border-4 border-black hover:bg-[#FFE600] transition-colors"
          >
            Return to Hub
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6">
        <div className="max-w-2xl w-full space-y-8">
          <div className="text-center space-y-4">
            <Cpu className="w-16 h-16 text-[#00F0FF] mx-auto animate-pulse" />
            <h1 className="text-4xl font-heading uppercase text-white">
              Deterministic Engine
            </h1>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#111] border-2 border-[#00F0FF]">
              <span className="text-[10px] font-black uppercase text-[#00F0FF]">BETA</span>
              <span className="text-xs font-heading text-white">Analyzing @{username}</span>
            </div>
          </div>

          <div className="bg-[#111] border-4 border-[#00F0FF] p-6 space-y-4">
            <div className="flex items-center gap-2 text-[#FFE600]">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-heading uppercase">Phase: {currentPhase || "Initializing"}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-[#1a1a1a] p-3 border border-[#00F0FF]">
                <div className="text-2xl font-heading text-[#00F0FF]">{budget.rest}</div>
                <div className="text-[10px] font-heading uppercase text-white/50">REST Calls</div>
              </div>
              <div className="bg-[#1a1a1a] p-3 border border-[#FF00E5]">
                <div className="text-2xl font-heading text-[#FF00E5]">{budget.graphql}</div>
                <div className="text-[10px] font-heading uppercase text-white/50">GraphQL</div>
              </div>
              <div className="bg-[#1a1a1a] p-3 border border-[#FFE600]">
                <div className="text-2xl font-heading text-[#FFE600]">{budget.search}</div>
                <div className="text-[10px] font-heading uppercase text-white/50">Search</div>
              </div>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {progress.slice(-5).map((event, i) => (
                <div key={i} className="text-xs font-mono text-white/60 flex items-center gap-2">
                  <span className="text-[#00F0FF]">{event.kind}:</span>
                  <span>{event.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const score = data.scores.finalScore;
  const grade = data.interpretation.overall.grade;
  const archetype = data.interpretation.archetypes[0]?.label || "Mixed public activity";
  const chronotype = data.interpretation.workRhythm.chronotypeTag;
  const momentum = data.interpretation.momentum.label;
  const dataQuality = data.interpretation.dataQuality.label;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <Header>
        <button
          onClick={() => fetchData(true)}
          disabled={isRefreshing}
          className="px-4 py-2 bg-[#00F0FF] text-black font-heading uppercase text-xs font-bold border-2 border-black hover:bg-[#FFE600] transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </Header>

      <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b-4 border-[#00F0FF] pb-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 bg-[#00F0FF] text-black text-[10px] font-black uppercase">
                DETERMINISTIC ENGINE
              </div>
              <div className="px-3 py-1 bg-[#FF00E5] text-white text-[10px] font-black uppercase">
                BETA
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-heading uppercase tracking-tighter">
              {username}&apos;s <span className="text-[#00F0FF]">Protocol</span>
            </h1>
            <div className="text-sm font-body text-white/60">
              {data.meta.analysisMode.toUpperCase()} mode &middot; {data.meta.budget.rest.used + data.meta.budget.graphql.used + data.meta.budget.search.used} API calls &middot; {data.interpretation.confidence.label} confidence
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-6xl font-heading text-[#FFE600]">{score}</div>
              <div className="text-xs font-heading uppercase text-white/50">Score</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-heading text-[#FF00E5]">{grade}</div>
              <div className="text-xs font-heading uppercase text-white/50">Grade</div>
            </div>
          </div>
        </div>

        {/* Score Breakdown */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ScoreCard
            title="Volume"
            score={data.scores.breakdown["2.1"]?.value as number || 0}
            weight={data.scores.weights["2.1"] || 0}
            icon={<BarChart3 className="w-5 h-5" />}
          />
          <ScoreCard
            title="Consistency"
            score={data.scores.breakdown["2.2"]?.value as number || 0}
            weight={data.scores.weights["2.2"] || 0}
            icon={<Activity className="w-5 h-5" />}
          />
          <ScoreCard
            title="Collaboration"
            score={data.scores.breakdown["2.3"]?.value as number || 0}
            weight={data.scores.weights["2.3"] || 0}
            icon={<Shield className="w-5 h-5" />}
          />
          <ScoreCard
            title="Impact"
            score={data.scores.breakdown["2.4"]?.value as number || 0}
            weight={data.scores.weights["2.4"] || 0}
            icon={<TrendingUp className="w-5 h-5" />}
          />
        </section>

        {/* Interpretation */}
        <section className="bg-[#111] border-4 border-[#00F0FF] p-6 space-y-6">
          <h2 className="text-2xl font-heading uppercase flex items-center gap-2">
            <Target className="w-6 h-6 text-[#00F0FF]" />
            Profile Interpretation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="text-xs font-heading uppercase text-[#FFE600]">Archetype</div>
              <div className="text-xl font-heading">{archetype}</div>
              <div className="text-xs text-white/60">{data.interpretation.archetypes[0]?.description}</div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-heading uppercase text-[#FF00E5]">Chronotype</div>
              <div className="text-xl font-heading">{chronotype}</div>
              <div className="text-xs text-white/60">{data.interpretation.workRhythm.chronotypeDescription}</div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-heading uppercase text-[#00F0FF]">Momentum</div>
              <div className="text-xl font-heading">{momentum}</div>
              <div className="text-xs text-white/60">{data.interpretation.momentum.description}</div>
            </div>
          </div>
        </section>

        {/* Tags */}
        <section className="space-y-4">
          <h2 className="text-2xl font-heading uppercase">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {data.interpretation.tags.filter((tag) => tag.active).map((tag) => (
              <div
                key={tag.id}
                className="px-3 py-1 bg-[#111] border-2 border-[#00F0FF] text-[#00F0FF] text-xs font-heading uppercase"
              >
                {tag.label}
              </div>
            ))}
          </div>
        </section>

        {/* Signals */}
        <section className="space-y-4">
          <h2 className="text-2xl font-heading uppercase flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-[#FFE600]" />
            Signals
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.values(data.signals).filter((signal) => signal.flagged).map((signal) => (
              <div
                key={signal.id}
                className="bg-[#1a1a1a] border-l-4 border-[#FF00E5] p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#FF00E5]" />
                  <span className="text-sm font-heading uppercase text-[#FF00E5]">{signal.name}</span>
                </div>
                <p className="text-xs text-white/60">{signal.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Meta Information */}
        <section className="bg-[#111] border-4 border-[#00F0FF] p-6 space-y-4">
          <h2 className="text-2xl font-heading uppercase flex items-center gap-2">
            <Cpu className="w-6 h-6 text-[#00F0FF]" />
            Engine Metadata
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-[#1a1a1a] p-3 border border-[#00F0FF]">
              <div className="text-lg font-heading text-[#00F0FF]">{data.meta.authTier}</div>
              <div className="text-[10px] font-heading uppercase text-white/50">Auth Tier</div>
            </div>
            <div className="bg-[#1a1a1a] p-3 border border-[#FF00E5]">
              <div className="text-lg font-heading text-[#FF00E5]">{data.meta.analysisMode}</div>
              <div className="text-[10px] font-heading uppercase text-white/50">Mode</div>
            </div>
            <div className="bg-[#1a1a1a] p-3 border border-[#FFE600]">
              <div className="text-lg font-heading text-[#FFE600]">{dataQuality}</div>
              <div className="text-[10px] font-heading uppercase text-white/50">Data Quality</div>
            </div>
            <div className="bg-[#1a1a1a] p-3 border border-[#00F0FF]">
              <div className="text-lg font-heading text-[#00F0FF]">{data.interpretation.confidence.score}</div>
              <div className="text-[10px] font-heading uppercase text-white/50">Confidence</div>
            </div>
          </div>
          <div className="text-xs font-mono text-white/40">
            {data.meta.warnings.length > 0 && (
              <div className="space-y-1">
                <div className="text-[#FFE600]">Warnings:</div>
                {data.meta.warnings.slice(0, 5).map((warning, i) => (
                  <div key={i}>- {warning}</div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function ScoreCard({
  title,
  score,
  weight,
  icon,
}: {
  title: string;
  score: number;
  weight: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-[#111] border-4 border-[#00F0FF] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#00F0FF]">
          {icon}
          <span className="text-xs font-heading uppercase">{title}</span>
        </div>
        <span className="text-[10px] font-heading text-white/40">{(weight * 100).toFixed(0)}%</span>
      </div>
      <div className="text-3xl font-heading text-white">{score}</div>
      <div className="w-full h-2 bg-[#1a1a1a] overflow-hidden">
        <div
          className="h-full bg-[#00F0FF] transition-all duration-1000"
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
