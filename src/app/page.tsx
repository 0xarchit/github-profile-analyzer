"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bot, Flame, Trophy, Zap, User, Power } from "lucide-react";
import { Header } from "@/components/Header";
import { fetchAuthIdentity, type AuthIdentity } from "@/lib/client-auth";

export default function Home() {
  const [username, setUsername] = useState("");
  const [user, setUser] = useState<AuthIdentity | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isVersionExpanded, setIsVersionExpanded] = useState(false);
  const [isVersionClickExpanded, setIsVersionClickExpanded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    void fetchAuthIdentity(controller.signal)
      .then((identity) => {
        setUser(identity);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = username.trim().toLowerCase();
    if (
      clean &&
      clean !== "undefined" &&
      clean !== "null" &&
      !/[/?#]/.test(clean)
    ) {
      setInputError(null);
      router.push(`/${encodeURIComponent(clean)}`);
    } else {
      setInputError(
        "IDENTIFIER_INVALID: Target must be a valid GitHub handle.",
      );
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-neo-bg text-black relative overflow-hidden transition-colors duration-500">
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(90deg, black 1px, transparent 0), linear-gradient(black 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neo-yellow/20 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neo-pink/20 blur-[120px] rounded-full animate-pulse" />

      <Header floating />

      <div className="max-w-4xl w-full space-y-16 z-10 text-center">
        <header className="space-y-10">
          <div
            className="inline-block relative cursor-default"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div
              className={`absolute inset-0 bg-neo-yellow border-4 border-black transition-transform duration-300 ${isHovered ? "translate-x-5 translate-y-5" : "translate-x-3 translate-y-3"}`}
            />
            <div className="relative bg-white border-4 border-black p-8 px-12 md:px-20 transition-transform duration-300 hover:-translate-x-1 hover:-translate-y-1 group-hover:bg-neo-bg">
              <h1 className="text-5xl md:text-8xl font-heading uppercase tracking-tighter leading-none mb-2 text-black">
                GITHUB PROFILE
              </h1>
              <h2 className="text-4xl md:text-7xl font-heading uppercase tracking-tighter leading-none text-neo-pink flex items-center justify-center gap-4">
                ANALYZER
                <Zap className="w-10 h-10 fill-neo-yellow text-black animate-bounce" />
              </h2>
            </div>
            <div
              className={`absolute -bottom-6 -right-6 transition-all duration-300 ${
                isVersionExpanded || isVersionClickExpanded ? "w-80" : "w-auto"
              }`}
            >
              <button
                onClick={() => {
                  setIsVersionClickExpanded(!isVersionClickExpanded);
                  if (!isVersionClickExpanded) {
                    setIsVersionExpanded(true);
                  } else {
                    setIsVersionExpanded(false);
                  }
                }}
                onMouseEnter={() => {
                  if (!isVersionClickExpanded) {
                    setIsVersionExpanded(true);
                  }
                }}
                onMouseLeave={() => {
                  if (!isVersionClickExpanded) {
                    setIsVersionExpanded(false);
                  }
                }}
                className="bg-black text-white px-4 py-2 text-xs font-heading border-4 border-black rotate-3 shadow-neo hover:shadow-neo-lg transition-all w-full"
              >
                BETA VERSION
              </button>
              {(isVersionExpanded || isVersionClickExpanded) && (
                <div
                  className="absolute top-16 -right-2 bg-white border-4 border-black p-6 w-72 shadow-neo-lg space-y-3 z-50 animate-in fade-in duration-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-xs font-heading uppercase font-bold text-neo-pink">
                    New Experimental Interface
                  </p>
                  <p className="text-xs font-body leading-relaxed">
                    This is a beta release. If you encounter bugs, security
                    issues, or have suggestions for improvements, please
                    contribute via GitHub.
                  </p>
                  <div className="flex flex-col gap-2 pt-2 border-t-2 border-black/20">
                    <a
                      href="https://github.com/0xarchit/github-profile-analyzer/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-black uppercase bg-neo-yellow border-2 border-black px-3 py-2 hover:bg-black hover:text-white transition-colors"
                    >
                      Report Bug
                    </a>
                    <a
                      href="https://github.com/0xarchit/github-profile-analyzer/security/advisories"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-black uppercase bg-neo-pink text-white border-2 border-black px-3 py-2 hover:bg-black transition-colors"
                    >
                      Security Issue
                    </a>
                    <a
                      href="https://github.com/0xarchit/github-profile-analyzer"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-black uppercase bg-neo-green border-2 border-black px-3 py-2 hover:bg-black hover:text-white transition-colors"
                    >
                      Contribute
                    </a>
                  </div>
                </div>
              )}
            </div>
            {isVersionClickExpanded && (
              <div
                className="fixed inset-0 z-0 cursor-default"
                onClick={() => {
                  setIsVersionClickExpanded(false);
                  setIsVersionExpanded(false);
                }}
              />
            )}
          </div>

          <p className="text-xl font-body font-bold text-black/60 max-w-2xl mx-auto leading-relaxed">
            The high-fidelity protocol for technical identity analysis. Roast
            your code, quantify your impact, and upgrade your career trajectory.
          </p>
        </header>

        <form
          onSubmit={handleAnalyze}
          className="max-w-2xl mx-auto w-full space-y-8 text-black"
        >
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative group">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10 pointer-events-none">
                <span className="text-2xl font-black text-neo-pink">$</span>
                <div className="w-1 h-8 bg-neo-pink animate-terminal-blink" />
              </div>
              <input
                type="text"
                placeholder="USER_IDENTIFIER"
                className="neo-input w-full text-2xl pl-16 h-24 shadow-neo-lg group-hover:shadow-neo transition-all bg-white font-black border-4"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase opacity-60 bg-black text-white px-2 py-1 border-2 border-black">
                Target_Node
              </div>
            </div>
            <button
              type="submit"
              className="neo-button bg-neo-pink text-2xl h-24 px-12 shadow-neo-lg hover:bg-black hover:text-white group flex items-center justify-center gap-3"
            >
              Scan Matrix
              <Zap className="w-6 h-6 fill-neo-yellow" />
            </button>
          </div>

          {inputError && (
            <p className="text-[10px] font-black uppercase tracking-wider text-neo-pink">
              {inputError}
            </p>
          )}

          {user && (
            <div className="flex justify-center space-x-8">
              <button
                type="button"
                onClick={() => router.push(`/${user.username}`)}
                className="text-xs font-black uppercase flex items-center gap-2 hover:text-neo-pink tracking-widest group"
              >
                <div className="p-1 border-2 border-black group-hover:bg-neo-pink">
                  <User className="w-4 h-4" />
                </div>
                Analyze Internal Profile
              </button>
              <div className="w-px h-8 bg-black/10" />
              <div className="text-xs font-black uppercase flex items-center gap-2 opacity-50">
                <div className="p-1 border-2 border-black/20">
                  <Power className="w-4 h-4" />
                </div>
                Node Linked
              </div>
            </div>
          )}
        </form>

        <footer className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-16">
          <FeatureCard
            title="AI Deep Scan"
            desc="Deep kernel analysis of authored repositories."
            icon={<Bot className="w-12 h-12" />}
          />
          <FeatureCard
            title="Consistency Hub"
            desc="Real-time multi-dimensional streak tracking."
            icon={<Flame className="w-12 h-12" />}
          />
          <FeatureCard
            title="Merit Badges"
            desc="AI-quantified achievement protocol artifacts."
            icon={<Trophy className="w-12 h-12" />}
          />
        </footer>
      </div>
    </main>
  );
}

function FeatureCard({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="neo-card bg-white p-8 border-4 border-black hover:-translate-y-2 transition-transform duration-300 cursor-default flex flex-col items-center group shadow-neo relative overflow-hidden text-black">
      <div className="absolute top-0 left-0 w-2 h-full bg-neo-pink opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="mb-6 text-black group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h4 className="text-lg font-heading uppercase mb-2">{title}</h4>
      <p className="text-[10px] font-bold text-black/50 leading-tight px-4">
        {desc}
      </p>
    </div>
  );
}
