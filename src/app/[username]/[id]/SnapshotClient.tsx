"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PDFExportButton } from "@/components/PDFExportButton";
import { Header } from "@/components/Header";
import { StatsDashboard } from "@/components/StatsDashboard";
import { Trophy, Zap, FolderGit, Star, Clock } from "lucide-react";
import { AnalysisResult } from "@/types";
import { ScanningInterface } from "@/components/ScanningInterface";

interface SnapshotClientProps {
  username: string;
  id: string;
}

export function SnapshotClient({ username, id }: SnapshotClientProps) {
  const router = useRouter();
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showStarModal, setShowStarModal] = useState(false);
  const [viewerUsername, setViewerUsername] = useState("");
  const [verifyingStar, setVerifyingStar] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`/api/scans/${id}`);
      const result = await res.json();

      if (res.status === 403 && result.error === "Star required") {
        setShowStarModal(true);
        return;
      }

      if (!res.ok) {
        setError(result.error || "Snapshot retrieval failed");
        return;
      }

      setData(result.data);
    } catch {
      setError("NETWORK_FAILURE");
    }
  }, [id]);

  useEffect(() => {
    fetchSnapshot();
  }, [id, fetchSnapshot]);

  const handleViewerVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewerUsername.trim()) return;

    setVerificationError(null);
    setVerifyingStar(true);
    try {
      const starRes = await fetch(`/api/auth/verify-guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: viewerUsername.trim() }),
      });
      const resData = await starRes.json();
      if (starRes.ok && resData.success) {
        setShowStarModal(false);
        void fetchSnapshot();
      } else {
        setVerificationError(resData.message || "Star not detected.");
      }
    } catch {
      setVerificationError("Verification node unreachable.");
    } finally {
      setVerifyingStar(false);
    }
  };

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-neo-bg">
        <div className="neo-card max-w-md w-full text-center space-y-6 bg-white border-8 border-black shadow-neo-lg">
          <h2 className="text-4xl font-heading uppercase text-red-500">
            Record Missing
          </h2>
          <p className="font-body font-bold italic">
            &quot;This historical artifact has been lost or corrupted in the
            timeline.&quot;
          </p>
          <button
            onClick={() => router.push("/")}
            className="neo-button bg-neo-yellow w-full text-xl"
          >
            Return to Hub
          </button>
        </div>
      </div>
    );

  if (showStarModal)
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-neo-bg relative overflow-hidden">
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-40" />
        <div className="neo-card max-w-lg w-full text-center space-y-8 relative z-50 bg-white border-8 border-black shadow-neo-lg p-12 text-black">
          <Star className="w-24 h-24 text-neo-yellow fill-neo-yellow mx-auto animate-bounce" />
          <h2 className="text-4xl font-heading uppercase">History Locked</h2>
          <p className="font-body text-xl font-bold opacity-70">
            Star the repo to unlock this historical snapshot.
          </p>
          <form onSubmit={handleViewerVerification} className="space-y-4">
            <input
              type="text"
              placeholder="GITHUB USERNAME..."
              className="neo-input w-full text-center h-16 text-lg"
              value={viewerUsername}
              onChange={(e) => setViewerUsername(e.target.value)}
              required
            />
            <button
              type="submit"
              className="neo-button bg-neo-pink text-white w-full py-4 text-xl"
            >
              {verifyingStar ? "Verifying..." : "Unlock History"}
            </button>

            {verificationError && (
              <p className="text-[10px] font-black uppercase tracking-wider text-neo-pink">
                {verificationError}
              </p>
            )}
          </form>
        </div>
      </div>
    );

  if (!data) return <ScanningInterface />;

  return (
    <main className="min-h-screen p-2 sm:p-3 md:p-4 lg:p-8 bg-neo-bg space-y-8 sm:space-y-10 md:space-y-12 w-full max-w-full lg:max-w-7xl mx-auto text-black overflow-x-hidden">
      <Header>
        {data && (
          <PDFExportButton
            data={data}
            filename={`Snapshot_${username}_${id}.pdf`}
            label="Download Archive"
            shortLabel="Archive"
          />
        )}
      </Header>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6 border-b-6 md:border-b-8 border-black pb-6 md:pb-8">
        <div className="bg-black text-white px-4 py-2 text-[10px] font-black uppercase shadow-neo flex items-center gap-2">
          <Clock className="w-4 h-4 text-neo-yellow" />
          Historical Archive:{" "}
          {new Date(data.cachedAt || Date.now()).toLocaleDateString()}
        </div>
        <div className="space-y-1 text-black mt-6 md:mt-0">
          <h1 className="text-3xl md:text-5xl font-heading uppercase tracking-tighter">
            Snapshot: <span className="text-neo-pink">{username}</span>
          </h1>
        </div>
      </div>

      <div className="opacity-80 scale-[0.98] pointer-events-none grayscale-[0.3] space-y-12">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 neo-card bg-neo-yellow flex flex-col items-center justify-center py-12 relative overflow-hidden border-8 shadow-neo-lg group">
            <div className="absolute top-4 left-4 bg-black text-white px-3 py-1 text-[10px] font-black uppercase">
              Core Rank
            </div>
            <div className="absolute -right-12 -top-12 w-32 h-32 bg-white/20 rotate-45" />
            <span className="text-sm font-black uppercase mb-4 tracking-[0.5em] opacity-40">
              Engineering Quotient
            </span>
            <span className="text-[4rem] sm:text-[6rem] md:text-[8rem] lg:text-[10rem] font-heading leading-tight -mb-2 sm:-mb-4 md:-mb-6 lg:-mb-10 tracking-tighter drop-shadow-neo relative z-10">
              {data.score}
            </span>
            <div className="flex flex-col items-center w-full px-3 sm:px-4 md:px-6 lg:px-8 mt-3 sm:mt-6 md:mt-8 lg:mt-12 space-y-2 sm:space-y-3 md:space-y-4 relative z-10">
              <div className="w-full h-3 sm:h-4 md:h-6 lg:h-8 bg-black/10 border-2 sm:border-3 md:border-4 border-black box-content flex items-center p-0.5 sm:p-1 overflow-hidden">
                <div
                  className="h-full bg-black flex"
                  style={{ width: `${data.score}%` }}
                >
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="flex-1 border-r border-white/20" />
                  ))}
                </div>
              </div>
              <span className="text-xs sm:text-sm md:text-base lg:text-lg font-heading border-2 sm:border-3 md:border-4 border-black px-3 sm:px-4 md:px-6 lg:px-8 py-1 sm:py-2 md:py-3 bg-white uppercase shadow-neo-lg flex items-center gap-1.5 sm:gap-2 md:gap-3 text-center line-clamp-2">
                <Trophy className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-neo-yellow fill-neo-yellow" />
                {data.developer_type || "Unknown Entity"}
              </span>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <div className="neo-card bg-white p-0 overflow-hidden border-4 border-black shadow-neo-lg hover:shadow-neo transition-all">
              <div className="bg-black text-white px-6 py-4 border-b-4 border-black flex justify-between items-center">
                <h3 className="text-xl font-heading uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-5 h-5 fill-neo-yellow text-neo-yellow" />
                  Neural Roast
                </h3>
                <span className="text-[10px] font-black uppercase opacity-60 tracking-[0.2em]">
                  Archived Analysis
                </span>
              </div>
              <div className="p-10 italic text-3xl font-heading leading-snug text-neo-pink relative">
                <div className="absolute top-4 left-4 text-6xl opacity-10 select-none">
                  &quot;
                </div>
                &quot;{data.segments?.roast || "Analysis pending..."}&quot;
                <div className="absolute bottom-4 right-4 text-6xl opacity-10 select-none rotate-180">
                  &quot;
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        </section>

        <StatsDashboard data={data} />

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="neo-card bg-white space-y-6 border-4 shadow-neo hover:shadow-neo-lg transition-all overflow-hidden relative p-8">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Trophy className="w-32 h-32" />
            </div>
            <h3 className="text-3xl font-heading uppercase border-b-4 border-black pb-2 flex items-center gap-3 relative z-10">
              <Trophy className="w-8 h-8 fill-neo-yellow" />
              Artifacts Collected
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 relative z-10">
              {data.improvement_areas?.map((area, i) => (
                <div
                  key={i}
                  className="neo-box p-4 bg-white flex flex-col items-center gap-2 relative border-2 border-black"
                >
                  <span className="text-[8px] font-black uppercase text-center leading-none tracking-tighter">
                    {area}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="neo-card bg-[#f8fafc] space-y-6 border-4 shadow-neo hover:shadow-neo-lg transition-all relative p-8">
            <h3 className="text-3xl font-heading uppercase border-b-4 border-black pb-2 flex items-center gap-3">
              <FolderGit className="w-8 h-8" />
              Growth Opportunities
            </h3>
            <div className="space-y-4">
              {data.diagnostics?.slice(0, 5).map((diag, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center bg-white border-2 border-black p-4 shadow-neo hover:-translate-y-1 hover:shadow-none transition-all"
                >
                  <div className="space-y-1">
                    <p className="font-heading uppercase text-sm leading-none">
                      {diag}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="neo-card bg-neo-yellow p-8 border-4 border-black text-center text-black shadow-neo relative z-20">
        <h4 className="text-2xl font-heading uppercase mb-2">
          Viewing Historical Record
        </h4>
        <p className="font-body font-bold italic">
          &quot;This data is a static point in the developer&apos;s timeline.
          Live metrics may differ.&quot;
        </p>
        <button
          onClick={() => router.push(`/${username}`)}
          className="neo-button bg-black text-white mt-4 px-8"
        >
          View Live Profile
        </button>
      </div>
    </main>
  );
}

function SectionCard({
  title,
  content,
  bgColor,
  accent,
}: {
  title: string;
  content: string | undefined;
  bgColor: string;
  accent: string;
}) {
  if (!content) return null;
  return (
    <div
      className={`neo-card ${bgColor} space-y-4 border-4 border-black h-full shadow-neo transition-all ${accent} border-l-12 p-6 text-black`}
    >
      <h3 className="text-xl font-heading uppercase tracking-wide border-b-2 border-black/10 pb-3 flex items-center gap-2">
        <div className="w-2 h-2 bg-black rounded-full" />
        {title}
      </h3>
      <p className="text-md font-body leading-relaxed font-bold opacity-70 whitespace-pre-line">
        {content}
      </p>
    </div>
  );
}
