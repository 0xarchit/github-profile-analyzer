import type { Metadata } from "next";
import { Zap, Users, Hash, ArrowUp, ArrowDown, Clock, Activity, BarChart3 } from "lucide-react";
import { Header } from "@/components/Header";
import { getAnalyticsSummary } from "@/lib/db";
import type { AnalyticsSummary } from "@/lib/db";
import { getCachedData, setCachedData } from "@/lib/redis";

export const metadata: Metadata = {
  title: "System Analytics | GitHub Profile Analyzer",
  description:
    "Live protocol telemetry — public token usage and request analytics for GitHub Profile Analyzer.",
};

// Allow Next.js to revalidate every 15 minutes at the page level too
export const revalidate = 900;

const ANALYTICS_CACHE_KEY = "analytics:summary";

async function fetchAnalyticsSummary(): Promise<AnalyticsSummary | null> {
  try {
    // 1. Try Redis cache first
    const cached = await getCachedData<AnalyticsSummary>(ANALYTICS_CACHE_KEY);
    if (cached) return cached;

    // 2. Direct DB call — no HTTP loopback
    const summary = await getAnalyticsSummary();

    // 3. Populate cache for subsequent API hits
    await setCachedData(ANALYTICS_CACHE_KEY, summary, 900);

    return summary;
  } catch (err) {
    console.error("[ANALYTICS_PAGE] Failed to fetch summary", err);
    return null;
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatMs(ms: number): string {
  if (!ms) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="neo-card bg-white p-6 border-4 border-black shadow-neo-lg relative overflow-hidden group hover:-translate-y-1 transition-transform duration-200">
      <div className={`absolute top-0 left-0 w-full h-1.5 ${accent}`} />
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2 border-2 border-black ${accent} text-black`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-black leading-none">
        {value}
      </p>
      <p className="text-xs font-heading font-black uppercase tracking-widest text-black/50 mt-2">
        {label}
      </p>
      {sub && (
        <p className="text-[10px] font-body font-bold text-black/40 mt-1">
          {sub}
        </p>
      )}
    </div>
  );
}

function AvgRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b-2 border-black/10 last:border-0">
      <div className="flex items-center gap-3">
        <div className="text-black/40">{icon}</div>
        <span className="text-sm font-heading font-black uppercase text-black/70 tracking-wide">
          {label}
        </span>
      </div>
      <span className="text-lg font-display font-bold text-black tabular-nums">
        {value}
      </span>
    </div>
  );
}

export default async function AnalyticsPage() {
  const data = await fetchAnalyticsSummary();

  const lastUpdated = data?.last_updated
    ? new Date(data.last_updated).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  return (
    <main className="min-h-screen flex flex-col bg-neo-bg text-black relative overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(90deg, black 1px, transparent 0), linear-gradient(black 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="absolute top-[-5%] right-[-5%] w-[35%] h-[35%] bg-neo-blue/20 blur-[120px] rounded-full animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-5%] left-[-5%] w-[35%] h-[35%] bg-neo-yellow/20 blur-[120px] rounded-full animate-pulse pointer-events-none" />

      <div className="relative z-10 flex flex-col flex-1 p-4 sm:p-6 md:p-8 max-w-6xl mx-auto w-full space-y-8 mt-4">
        <Header floating={false} />

        {/* Page header */}
        <div className="space-y-4 pt-2">
          <div className="inline-flex items-center gap-2 bg-black text-white px-3 py-1.5 border-4 border-black shadow-neo font-heading text-[10px] sm:text-xs font-bold uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neo-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neo-green" />
            </span>
            <Activity className="w-3.5 h-3.5 text-neo-green" />
            <span>Public Telemetry</span>
          </div>
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-neo-yellow border-4 border-black translate-x-2 translate-y-2" />
            <div className="relative bg-white border-4 border-black px-6 py-4">
              <h1 className="text-3xl sm:text-5xl font-display font-bold uppercase tracking-tight text-black flex items-center gap-3">
                <BarChart3 className="w-8 h-8 sm:w-12 sm:h-12 shrink-0" />
                System Analytics
              </h1>
            </div>
          </div>
          <p className="text-sm sm:text-base font-body font-bold text-black/60 max-w-xl leading-relaxed">
            Live protocol telemetry. Token usage, request counts, and performance
            metrics — aggregated and anonymised.
          </p>
        </div>

        {data ? (
          <>
            {/* Primary stat cards */}
            <section>
              <h2 className="text-xs font-heading font-black uppercase tracking-widest text-black/40 mb-4">
                All-Time Totals
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                <StatCard
                  label="Total Requests"
                  value={formatNumber(data.total_requests)}
                  sub="Successful AI analyses"
                  accent="bg-neo-yellow"
                  icon={<Zap className="w-5 h-5" />}
                />
                <StatCard
                  label="Unique Profiles Scanned"
                  value={formatNumber(data.total_users)}
                  sub="Distinct GitHub usernames"
                  accent="bg-neo-blue"
                  icon={<Users className="w-5 h-5" />}
                />
                <StatCard
                  label="Total Tokens Used"
                  value={formatNumber(data.total_tokens_all)}
                  sub={`${formatNumber(data.total_input_tokens)} in / ${formatNumber(data.total_output_tokens)} out`}
                  accent="bg-neo-pink"
                  icon={<Hash className="w-5 h-5" />}
                />
              </div>
            </section>

            {/* Last 20 averages */}
            <section className="neo-card bg-white p-6 sm:p-8 border-4 border-black shadow-neo-lg">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b-4 border-black">
                <div className="bg-neo-yellow border-2 border-black p-2">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-heading font-black uppercase tracking-tight">
                    Avg — Last 20 Queries
                  </h2>
                  <p className="text-[10px] font-body text-black/50 font-bold uppercase tracking-wider">
                    Rolling window · anonymised
                  </p>
                </div>
              </div>
              <div className="space-y-0">
                <AvgRow
                  label="Input Tokens / Request"
                  value={formatNumber(data.avg_input_last20)}
                  icon={<ArrowUp className="w-4 h-4" />}
                />
                <AvgRow
                  label="Output Tokens / Request"
                  value={formatNumber(data.avg_output_last20)}
                  icon={<ArrowDown className="w-4 h-4" />}
                />
                <AvgRow
                  label="Total Tokens / Request"
                  value={formatNumber(data.avg_total_last20)}
                  icon={<Hash className="w-4 h-4" />}
                />
                <AvgRow
                  label="AI Response Time"
                  value={formatMs(data.avg_duration_ms_last20)}
                  icon={<Clock className="w-4 h-4" />}
                />
              </div>
            </section>

            {/* Footer timestamp */}
            {lastUpdated && (
              <p className="text-center text-[11px] font-mono font-bold text-black/40 uppercase tracking-widest pb-4">
                <Zap className="w-3 h-3 inline-block text-neo-pink mr-1.5" />
                Last updated · {lastUpdated} · Cached for 15 min · Invalidates on new scans
              </p>
            )}
          </>
        ) : (
          <div className="neo-card bg-white p-10 border-4 border-black shadow-neo-lg text-center space-y-4">
            <div className="text-5xl">📡</div>
            <h2 className="text-2xl font-display font-bold uppercase">
              Telemetry Unavailable
            </h2>
            <p className="text-sm font-body text-black/60">
              Analytics data could not be retrieved. The database may be
              warming up or there are no recorded scans yet.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
