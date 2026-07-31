"use client";

import { useState, useEffect } from "react";
import { Wrench, Star, Heart, FolderGit, CheckCircle, Clock, Zap } from "lucide-react";

interface MaintenancePageProps {
  title: string;
  desc: string;
}

function sanitizeHtmlDesc(rawDesc: string): string {
  if (!rawDesc) return "";
  // Clean up any escaped quotes or extra quote entities inside href attributes
  const unescaped = rawDesc
    .replace(/\\"/g, '"')
    .replace(/%22/g, '"')
    .replace(/&quot;/g, '"');

  // Ensure href="http..." or href="https..." doesn't retain leading quotes
  return unescaped.replace(
    /href=["']?\s*["']?(https?:\/\/[^"'\s>]+)["']?\s*["']?/gi,
    'href="$1" target="_blank" rel="noopener noreferrer"'
  );
}

export function MaintenancePage({ title, desc }: MaintenancePageProps) {
  const [hasStarred, setHasStarred] = useState(false);
  const [repoStars, setRepoStars] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchStars() {
      try {
        const res = await fetch("/api/star-status?repoOnly=true", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data?.repoStars === "number") {
            setRepoStars(data.repoStars);
          }
          if (typeof data?.hasStarred === "boolean") {
            setHasStarred(data.hasStarred);
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Ignore fetch errors during maintenance mode
      }
    }

    void fetchStars();
    return () => controller.abort();
  }, []);

  const cleanDesc = sanitizeHtmlDesc(desc);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-neo-bg text-black relative overflow-hidden">
      {/* Background Grid & Accent Blurs */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(90deg, black 1px, transparent 0), linear-gradient(black 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-neo-pink/20 blur-[130px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-neo-yellow/20 blur-[130px] rounded-full animate-pulse" />

      <div className="max-w-3xl w-full space-y-8 z-10 my-auto py-8">
        {/* Status Badge */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2.5 bg-black text-white px-4 py-2 border-4 border-black shadow-neo font-heading text-xs sm:text-sm font-bold uppercase tracking-wider">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neo-yellow opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-neo-yellow"></span>
            </span>
            <Wrench className="w-4 h-4 text-neo-yellow animate-spin" style={{ animationDuration: '6s' }} />
            <span>Protocol Under Maintenance</span>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="neo-card bg-white p-6 sm:p-10 border-4 border-black shadow-neo-lg text-center space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-neo-pink via-neo-yellow to-neo-blue" />
          
          <div className="space-y-4 pt-2">
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-display font-bold uppercase tracking-tight leading-tight text-black break-words">
              {title}
            </h1>

            {/* Description rendered with HTML support */}
            <div
              className="maintenance-html-content text-sm sm:text-lg font-body text-black/80 max-w-xl mx-auto leading-relaxed pt-2"
              dangerouslySetInnerHTML={{ __html: cleanDesc }}
            />
          </div>

          {/* Re-opening notice */}
          <div className="bg-neo-yellow/30 border-4 border-black p-4 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs sm:text-sm font-heading font-black uppercase shadow-neo">
            <div className="flex items-center gap-2 text-black shrink-0">
              <Clock className="w-5 h-5 text-black animate-bounce" />
              <span>We&apos;ll Be Back Soon!</span>
            </div>
            <div className="hidden sm:block w-1.5 h-1.5 rounded-full bg-black" />
            <p className="text-[11px] sm:text-xs font-body font-bold text-black/70 normal-case">
              System optimization in progress. All protocol features will return shortly.
            </p>
          </div>

          {/* Interactive Action Buttons */}
          <div className="pt-4 border-t-4 border-black/10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/0xarchit/github-profile-analyzer"
              target="_blank"
              rel="noopener noreferrer"
              className="neo-button bg-neo-yellow text-black text-xs sm:text-sm font-black flex items-center justify-center gap-2.5 w-full sm:w-auto hover:bg-black hover:text-white transition-all shadow-neo"
            >
              <FolderGit className="w-4 h-4 shrink-0" />
              <span>Star The Repo</span>
              <div className="flex items-center gap-1 bg-black text-white px-2 py-0.5 border-2 border-neo-yellow text-[10px] sm:text-xs font-heading">
                {hasStarred ? (
                  <CheckCircle className="w-3 h-3 text-neo-green fill-neo-green shrink-0" />
                ) : (
                  <Star className="w-3 h-3 fill-neo-yellow text-neo-yellow animate-pulse shrink-0" />
                )}
                <span className="tabular-nums">
                  {repoStars !== null ? repoStars.toLocaleString() : "★"}
                </span>
              </div>
            </a>

            <a
              href="https://github.com/sponsors/0xarchit"
              target="_blank"
              rel="noopener noreferrer"
              className="neo-button bg-neo-pink text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 w-full sm:w-auto hover:bg-black hover:text-neo-pink transition-all shadow-neo"
            >
              <Heart className="w-4 h-4 fill-white text-white shrink-0 animate-pulse" />
              <span>Support Project</span>
            </a>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] font-mono font-bold text-black/50 uppercase tracking-wider flex items-center justify-center gap-2">
          <Zap className="w-3.5 h-3.5 text-neo-pink inline-block" />
          <span>GitScore Protocol &bull; Maintenance Status Active</span>
        </div>
      </div>
    </main>
  );
}
