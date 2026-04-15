"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, Variants } from "framer-motion";
import { PDFExportButton } from "@/components/PDFExportButton";
import { Header } from "@/components/Header";
import { StatsDashboard } from "@/components/StatsDashboard";
import { ScanningInterface } from "@/components/ScanningInterface";
import {
  Trophy,
  RefreshCw,
  Lock,
  Zap,
  FolderGit,
  Star,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { AnalysisResult } from "@/types";
import { fetchAuthIdentity } from "@/lib/client-auth";

interface ProfileClientProps {
  username: string;
  initialData?: AnalysisResult;
}

export function ProfileClient({ username, initialData }: ProfileClientProps) {
  const router = useRouter();
  const [data, setData] = useState<AnalysisResult | null>(initialData || null);
  const [error, setError] = useState<string | null>(null);
  const [showStarModal, setShowStarModal] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isVerifyingAgain, setIsVerifyingAgain] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(
    async (force = false, nosave = false) => {
      try {
        setIsRefreshing(force);
        const baseUrl = `/api/analyze?username=${username}`;
        const res = await fetch(
          `${baseUrl}${force ? "&force=true" : ""}${nosave ? "&nosave=true" : ""}`,
        );
        const result = await res.json();

        if (res.status === 403 && result.error === "Star required") {
          setShowStarModal(true);
          return;
        }

        if (!res.ok) {
          setError(result.error || "Diagnostic matrix failed");
          return;
        }

        setData(result);
        setError(null);

        const confetti = (await import("canvas-confetti")).default;
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#FFE600", "#FF00E5", "#00F0FF", "#000000"],
        });
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

    void fetchAuthIdentity()
      .then((identity) => {
        setIsOwner(identity?.username?.toLowerCase() === safeUsername);
      })
      .catch(() => {
        setIsOwner(false);
      });

    if (!initialData) {
      void fetchData();
    }
  }, [username, initialData, fetchData]);

  const handleRecheckStar = async () => {
    setIsVerifyingAgain(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      void fetchData();
      setShowStarModal(false);
    } finally {
      setIsVerifyingAgain(false);
    }
  };

  if (error) {
    const isQuota = error === "NEURAL_QUOTA_EXCEEDED";
    const isSaturated = error === "REMOTE_SATURATION";

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-neo-bg">
        <div className="neo-card max-w-md w-full text-center space-y-6 bg-white border-8 border-black shadow-neo-lg">
          <h2 className="text-4xl font-heading uppercase text-red-500">
            {isQuota
              ? "Quota Depleted"
              : isSaturated
                ? "Node Saturated"
                : "Scan Failure"}
          </h2>
          <div className="p-4 bg-red-100 border-4 border-black font-body font-bold italic">
            &quot;
            {isQuota
              ? "Your guest scan permit has expired. Integrate GitHub for unlimited protocol access."
              : isSaturated
                ? "GitHub API nodes are cooling down. This protocol will resume shortly."
                : error}
            &quot;
          </div>
          <button
            onClick={() => router.push("/")}
            className="neo-button bg-neo-yellow w-full text-xl"
          >
            Return to Hub
          </button>
        </div>
      </div>
    );
  }

  if (showStarModal)
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
              <span className="text-neo-pink font-black">{username}</span>
              &apos;s code shards.
            </p>
            <p className="font-body text-sm opacity-60">
              Star the repository to verify profile access.
            </p>
          </div>

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
              onClick={handleRecheckStar}
              disabled={isVerifyingAgain}
              className="neo-button bg-neo-green text-center text-lg py-4 w-full disabled:opacity-50 font-bold"
            >
              {isVerifyingAgain ? "Rechecking..." : "Recheck Star Status"}
            </button>
            <button
              onClick={() => router.push("/")}
              className="neo-button bg-neo-pink text-white text-lg py-4 w-full font-bold"
            >
              Return to Hub
            </button>
          </div>

          <div className="pt-4 border-t-4 border-black/10">
            <button
              onClick={() => router.push("/api/auth/github")}
              className="text-xs font-black uppercase underline hover:text-neo-blue transition-colors"
            >
              Or Integrate GitHub for Automatic Detection
            </button>
          </div>
        </div>
      </div>
    );

  if (!data) return <ScanningInterface />;

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5,
      },
    },
  };

  return (
    <motion.main
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen p-2 sm:p-3 md:p-4 lg:p-8 bg-neo-bg space-y-6 sm:space-y-8 md:space-y-12 lg:space-y-16 w-full max-w-full lg:max-w-7xl mx-auto relative overflow-x-clip protocol-noise"
    >
      <Header>
        {data && (
          <PDFExportButton
            data={data}
            filename={`Analysis_${username}.pdf`}
            label="Intel.Export()"
            shortLabel="Export"
          />
        )}

        {(data.isLocked || data.isHistorical) && (
          <button
            onClick={() => fetchData(true, true)}
            disabled={isRefreshing}
            className="neo-button bg-neo-yellow text-[10px] md:text-sm flex items-center gap-2 group shadow-neo-active hover:shadow-neo transition-all disabled:opacity-50"
          >
            <Zap className="w-3 h-3 md:w-4 md:h-4 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">See Latest Analysis</span>
            <span className="sm:hidden">Latest</span>
          </button>
        )}

        {(isOwner || (!data.isLocked && !data.isHistorical)) && (
          <button
            onClick={() => fetchData(true, false)}
            disabled={isRefreshing}
            className="neo-button bg-neo-green text-[10px] md:text-sm flex items-center gap-2 group shadow-neo-active hover:shadow-neo transition-all disabled:opacity-50"
          >
            <RefreshCw className="w-3 h-3 md:w-4 md:h-4 group-active:rotate-180 transition-transform" />
            <span className="hidden sm:inline">Force Refresh</span>
            <span className="sm:hidden">Refresh</span>
          </button>
        )}
      </Header>

      <motion.div
        variants={itemVariants}
        className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6 border-b-6 md:border-b-8 border-black pb-6 md:pb-8 relative overflow-x-hidden"
      >
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="bg-neo-green text-black px-2 sm:px-3 py-0.5 sm:py-1 text-[8px] sm:text-[9px] md:text-[10px] font-black uppercase shadow-neo">
            Identity Verified
          </div>
          {(data.isLocked || data.isHistorical) && (
            <div className="bg-black text-white px-2 sm:px-3 py-0.5 sm:py-1 text-[8px] sm:text-[9px] md:text-[10px] font-black uppercase shadow-neo flex items-center gap-1">
              <Lock className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
              {data.isLocked ? "Protocol Locked" : "Historical Snapshot"}
            </div>
          )}
        </div>

        <div className="space-y-1 md:mt-0">
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-heading uppercase tracking-tighter leading-none">
            {username}&apos;s <span className="text-neo-pink">Protocol</span>
          </h1>
          <div className="flex items-center gap-2 text-xs sm:text-sm md:text-lg font-body font-bold opacity-60 italic flex-wrap">
            Status:{" "}
            {data.isLocked
              ? "Static snapshot"
              : data.isHistorical
                ? "Archived Analysis"
                : "Dynamic Edge calculation"}
            <div
              className={`w-2 h-2 ${data.isLocked || data.isHistorical ? "bg-neo-blue" : "bg-neo-green"} rounded-full animate-pulse`}
            />
          </div>
        </div>
      </motion.div>

      <motion.section
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 md:gap-8"
      >
        <div className="lg:col-span-4 neo-card bg-neo-yellow flex flex-col items-center justify-center py-6 sm:py-8 md:py-10 lg:py-12 px-3 sm:px-4 relative overflow-hidden border-4 sm:border-6 md:border-8 shadow-neo-lg group">
          <div className="absolute top-2 sm:top-3 md:top-4 left-2 sm:left-3 md:left-4 bg-black text-white px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1 text-[8px] sm:text-[9px] md:text-[10px] font-black uppercase border-b border-r sm:border-b-2 sm:border-r-2 border-neo-pink">
            Core Rank
          </div>
          <div className="absolute -right-12 -top-12 w-24 sm:w-28 md:w-32 h-24 sm:h-28 md:h-32 bg-white/20 rotate-45 group-hover:scale-150 transition-transform duration-700" />
          <span className="text-[9px] sm:text-xs md:text-sm font-black uppercase mb-2 sm:mb-3 md:mb-4 tracking-[0.2em] sm:tracking-[0.3em] md:tracking-[0.4em] opacity-40">
            Engineering Quotient
          </span>
          <span className="text-[4rem] sm:text-[6rem] md:text-[8rem] lg:text-[10rem] font-heading leading-tight -mb-2 sm:-mb-3 md:-mb-6 lg:-mb-8 tracking-tighter drop-shadow-[2px_2px_0px_#000] sm:drop-shadow-[4px_4px_0px_#000] md:drop-shadow-[6px_6px_0px_#000] lg:drop-shadow-[8px_8px_0px_#000] relative z-10 transition-transform group-hover:scale-110 duration-500">
            {data.score}
          </span>
          <div className="flex flex-col items-center w-full px-2 sm:px-3 md:px-4 lg:px-6 mt-2 sm:mt-3 md:mt-4 lg:mt-6 space-y-2 md:space-y-3 lg:space-y-4 relative z-10">
            <div className="w-full h-2 sm:h-3 md:h-4 lg:h-6 bg-black/10 border border-black sm:border-2 md:border-2 lg:border-3 box-content flex items-center p-0.5 md:p-1 overflow-hidden">
              <div
                className="h-full bg-black transition-all duration-2000 ease-out flex"
                style={{ width: `${data.score}%` }}
              >
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="flex-1 border-r border-white/20" />
                ))}
              </div>
            </div>
            <span className="text-[8px] sm:text-xs md:text-sm lg:text-base font-heading border border-black sm:border-2 md:border-2 lg:border-3 border-black px-2 sm:px-3 md:px-4 lg:px-6 py-0.5 sm:py-1 md:py-2 lg:py-2 bg-white uppercase shadow-neo flex items-center gap-1 sm:gap-1.5 md:gap-2 group-hover:bg-black  group-hover:text-white transition-all transform group-hover:rotate-2 text-center line-clamp-2">
              <Trophy className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4 text-neo-yellow fill-neo-yellow shrink-0" />
              {data.developer_type || "Unknown Entity"}
            </span>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-2 sm:space-y-3 md:space-y-4 lg:space-y-6">
          <div className="neo-card bg-white p-0 overflow-hidden border-4 sm:border-[5px] md:border-[6px] shadow-neo-lg hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] md:hover:shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] active:scale-[0.99] transition-all">
            <div className="bg-black text-white px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 md:py-4 border-b-3 sm:border-b-4 md:border-b-4 border-black flex justify-between items-center gap-2">
              <h3 className="text-sm sm:text-xl md:text-2xl font-heading uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 fill-neo-yellow text-neo-yellow" />
                <span className="hidden sm:inline">Neural Roast</span>
                <span className="sm:hidden">Roast</span>
              </h3>
              <span className="text-[7px] sm:text-[9px] md:text-[10px] font-black uppercase opacity-60 tracking-[0.15em] animate-pulse">
                Live
              </span>
            </div>
            <div className="p-4 sm:p-6 md:p-8 lg:p-10 italic text-lg sm:text-2xl md:text-3xl font-heading leading-snug text-neo-pink relative">
              <div className="absolute top-2 sm:top-3 md:top-4 left-2 sm:left-4 md:left-6 text-3xl sm:text-5xl md:text-6xl opacity-10 select-none">
                &quot;
              </div>
              &quot;{data.segments?.roast || "Analysis pending..."}&quot;
              <div className="absolute bottom-2 sm:bottom-3 md:bottom-4 right-2 sm:right-4 md:right-6 text-3xl sm:text-5xl md:text-6xl opacity-10 select-none rotate-180">
                &quot;
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
            <SectionCard
              title="Direct Analysis"
              content={data.segments?.technical_analysis}
              bgColor="bg-white"
              accent="border-neo-blue"
            />
            <SectionCard
              title="Growth Strategy"
              content={data.segments?.strategic_advice}
              bgColor="bg-[#f8fafc]"
              accent="border-neo-green"
            />
          </div>
        </div>
      </motion.section>

      <motion.div variants={itemVariants}>
        <StatsDashboard data={data} />
      </motion.div>

      <motion.section
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8 w-full"
      >
        <div className="neo-card bg-white space-y-4 sm:space-y-5 md:space-y-6 border-4 shadow-neo hover:shadow-neo-lg transition-all overflow-hidden relative p-4 sm:p-6 md:p-8">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <Trophy className="w-32 h-32" />
          </div>
          <h3 className="text-2xl sm:text-2.5xl md:text-3xl font-heading uppercase border-b-4 border-black pb-2 flex items-center gap-2 sm:gap-3 relative z-10 flex-wrap">
            <Trophy className="w-8 h-8 fill-neo-yellow" />
            Neural achievements
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 relative z-10">
            {data.badges &&
              Object.entries(data.badges).map(([slug, asset], i) => (
                <div
                  key={i}
                  className="neo-box p-2 bg-white flex flex-col items-center gap-2 group relative cursor-help border-2 border-black hover:bg-black transition-all hover:-translate-y-1"
                >
                  <img
                    src={asset}
                    alt={slug}
                    width={48}
                    height={48}
                    className="w-12 h-12 object-contain group-hover:invert transition-all"
                  />
                  <span className="text-[6px] font-black uppercase text-center leading-none group-hover:text-white">
                    {slug.replace(/-/g, " ")}
                  </span>
                </div>
              ))}
            {!data.badges &&
              data.improvement_areas?.map((area, i) => (
                <div
                  key={i}
                  className="neo-box p-4 bg-white flex flex-col items-center gap-2 group relative cursor-help border-2 border-black hover:bg-black hover:text-white transition-all hover:-translate-y-1"
                >
                  <span className="text-[8px] font-black uppercase text-center">
                    {area}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="neo-card bg-[#f8fafc] space-y-4 sm:space-y-5 md:space-y-6 border-4 shadow-neo hover:shadow-neo-lg transition-all relative p-4 sm:p-6 md:p-8">
          <h3 className="text-2xl sm:text-2.5xl md:text-3xl font-heading uppercase border-b-4 border-black pb-2 flex items-center gap-2 sm:gap-3 flex-wrap">
            <Trophy className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-neo-yellow fill-neo-yellow" />
            GitHub Trophies
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {data.career_stats?.trophies &&
            data.career_stats.trophies.length > 0 ? (
              data.career_stats.trophies.map((trophy, i) => (
                <div
                  key={i}
                  className="neo-box p-3 bg-white flex flex-col items-center gap-2 border-2 border-black hover:bg-black hover:text-white transition-all hover:-translate-y-1 group"
                >
                  <div
                    className="w-full py-2 text-center font-black text-xs uppercase"
                    style={{ backgroundColor: trophy.color }}
                  >
                    {trophy.rank}
                  </div>
                  <span className="text-[10px] font-black uppercase text-center line-clamp-2 group-hover:text-white">
                    {trophy.name}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm opacity-50 col-span-full text-center">
                No trophy records found
              </p>
            )}
          </div>
        </div>

        <div className="neo-card bg-[#f8fafc] space-y-4 sm:space-y-5 md:space-y-6 border-4 shadow-neo hover:shadow-neo-lg transition-all relative p-4 sm:p-6 md:p-8">
          <h3 className="text-2xl sm:text-2.5xl md:text-3xl font-heading uppercase border-b-4 border-black pb-2 flex items-center gap-2 sm:gap-3 flex-wrap">
            <FolderGit className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />
            Strategic Growth
          </h3>
          <div className="space-y-4">
            {data.diagnostics?.slice(0, 5).map((diag, i) => (
              <div
                key={i}
                className="flex justify-between items-center bg-white border-[3px] border-black p-4 shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all cursor-pointer group"
              >
                <div className="space-y-1">
                  <p className="font-heading uppercase text-sm leading-none group-hover:text-neo-pink transition-colors">
                    {diag}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section variants={itemVariants} className="space-y-8">
        <h3 className="text-4xl font-heading uppercase border-b-8 border-black pb-4 flex items-center gap-3">
          <Zap className="w-10 h-10" />
          Project <span className="text-neo-pink">Ideas</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {data.project_ideas &&
          Object.values(data.project_ideas).length > 0 ? (
            Object.values(data.project_ideas).map((idea, i) => (
              <div
                key={i}
                className="neo-card bg-linear-to-br from-white to-[#fafafa] border-4 border-black shadow-neo hover:shadow-neo-lg transition-all flex flex-col gap-3 p-6"
              >
                <h4 className="text-lg font-heading uppercase leading-tight text-neo-blue">
                  {idea.title}
                </h4>
                <p className="text-sm font-body font-bold opacity-70 grow">
                  {idea.description}
                </p>
                <div className="flex flex-wrap gap-2 pt-2 border-t-2 border-black/10">
                  {idea["tech stack"]?.map((tech, j) => (
                    <span
                      key={j}
                      className="text-[10px] font-black uppercase bg-neo-yellow px-2 py-1 border border-black"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-center opacity-50 col-span-full">
              No project ideas available
            </p>
          )}
        </div>
      </motion.section>

      <motion.section variants={itemVariants} className="space-y-8">
        <h3 className="text-4xl font-heading uppercase border-b-8 border-black pb-4 flex items-center gap-3">
          <FolderGit className="w-10 h-10" />
          Code Shards <span className="text-neo-blue">Analysis</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(data.original_repos || {})
            .sort(([, a], [, b]) => (b.stars ?? 0) - (a.stars ?? 0))
            .slice(0, 6)
            .map(([name, repo], i) => (
              <div
                key={i}
                className="neo-card bg-white border-4 border-black shadow-neo hover:shadow-neo-lg hover:-translate-y-1 transition-all flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="bg-black text-white px-2 py-0.5 text-[10px] font-black uppercase">
                      {repo.primary_lang || "Unknown"}
                    </div>
                    <div className="flex items-center gap-1 font-heading text-sm">
                      <Star className="w-4 h-4 fill-neo-yellow" />
                      {repo.stars}
                    </div>
                  </div>
                  <h4 className="text-xl font-heading uppercase truncate">
                    {name}
                  </h4>
                  <p className="text-sm font-body line-clamp-2 opacity-60 font-bold">
                    {repo.description || "No description provided."}
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t-2 border-black/5 flex justify-between items-center">
                  <div className="flex gap-3 text-[10px] font-black uppercase opacity-40">
                    <span>Forks: {repo.forks}</span>
                    <span>Issues: {repo.issues}</span>
                  </div>
                  <a
                    href={`https://github.com/${username}/${name}`}
                    target="_blank"
                    className="p-2 hover:bg-neo-yellow border-2 border-transparent hover:border-black transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
        </div>
      </motion.section>
    </motion.main>
  );
}

function SectionCard({
  title,
  content,
  bgColor,
  accent,
}: {
  title: string;
  content: string;
  bgColor: string;
  accent: string;
}) {
  return (
    <div
      className={`neo-card ${bgColor} space-y-3 sm:space-y-4 border-3 sm:border-4 border-black h-full shadow-neo hover:shadow-neo-lg transition-all ${accent} border-l-8 sm:border-l-12 p-4 sm:p-6`}
    >
      <h3 className="text-lg sm:text-xl font-heading uppercase tracking-wide border-b-2 border-black/10 pb-2 sm:pb-3 flex items-center gap-2">
        <div className="w-2 h-2 bg-black rounded-full shrink-0" />
        <span className="line-clamp-2">{title}</span>
      </h3>
      <p className="text-sm sm:text-base font-body leading-relaxed font-bold opacity-70 whitespace-pre-line">
        {content}
      </p>
    </div>
  );
}
