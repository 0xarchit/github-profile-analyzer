"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  FolderGit,
  Star,
  CheckCircle,
  LogIn,
  Power,
  Settings as SettingsIcon,
  Home,
} from "lucide-react";
import { fetchAuthIdentity, type AuthIdentity } from "@/lib/client-auth";

interface HeaderProps {
  children?: React.ReactNode;
  floating?: boolean;
}

export function Header({ children, floating = false }: HeaderProps) {
  const [repoStars, setRepoStars] = useState<number | null>(null);
  const [hasStarred, setHasStarred] = useState(false);
  const [user, setUser] = useState<AuthIdentity | null>(null);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();

    const initialize = async () => {
      try {
        const repoRes = await fetch(
          "https://api.github.com/repos/0xarchit/github-profile-analyzer",
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );
        if (repoRes.ok) {
          const repoData = await repoRes.json();
          if (typeof repoData?.stargazers_count === "number") {
            setRepoStars(repoData.stargazers_count);
          }
        }

        const authIdentity = await fetchAuthIdentity(controller.signal);
        setUser(authIdentity);

        if (!authIdentity) {
          setHasStarred(false);
          return;
        }

        if (authIdentity.isGuest) {
          setHasStarred(true);
          return;
        }

        const starRes = await fetch("/api/star-status", {
          signal: controller.signal,
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!starRes.ok) {
          setHasStarred(false);
          return;
        }

        const starData = await starRes.json();
        setHasStarred(Boolean(starData?.hasStarred));
      } catch {
        setHasStarred(false);
      }
    };

    void initialize();

    return () => controller.abort();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error("Logout Failure");
      console.error("Logout failed:", error.message);
    }
  };

  const headerClasses = floating
    ? "absolute top-4 left-4 right-4 md:top-6 md:left-6 md:right-6 flex flex-col md:flex-row justify-between items-center gap-4 z-50"
    : "flex flex-col md:flex-row justify-between items-center gap-4 z-50 border-b-8 border-black pb-8 w-full";

  const containerClasses =
    "flex flex-col md:flex-row items-center gap-4 w-full justify-between";

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={headerClasses}
    >
      <div className={containerClasses}>
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.05, x: 2, y: 2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push("/")}
            className="neo-card py-2 px-3 md:px-4 bg-white flex items-center gap-2 hover:shadow-neo-active transition-all group border-[3px]"
          >
            <div className="w-2 h-2 bg-neo-green rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            <Home className="w-5 h-5 text-black" />
            <span className="text-[10px] md:text-xs font-black uppercase tracking-tighter">
              GitScore Protocol
            </span>
          </motion.button>

          <motion.a
            whileHover={{ scale: 1.05, x: 2, y: 2 }}
            whileTap={{ scale: 0.95 }}
            href="https://github.com/0xarchit/github-profile-analyzer"
            target="_blank"
            className="neo-card py-2 px-3 md:px-4 bg-white flex items-center gap-2 hover:shadow-neo-active transition-all group border-[3px]"
            rel="noopener noreferrer"
          >
            <FolderGit className="w-4 h-4 md:w-5 md:h-5 group-hover:rotate-12 transition-transform" />
            <div className="flex items-center gap-1.5 bg-black text-white px-2 py-0.5 border-2 border-neo-blue">
              {hasStarred ? (
                <CheckCircle className="w-3 h-3 text-neo-green fill-neo-green" />
              ) : (
                <Star className="w-3 h-3 fill-neo-yellow text-neo-yellow animate-pulse" />
              )}
              <span className="text-[10px] md:text-xs font-heading tabular-nums">
                {repoStars ?? "..."}
              </span>
            </div>
          </motion.a>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {children && <div className="flex gap-2">{children}</div>}

          <div className="w-px h-6 bg-black/10 hidden md:block" />

          {user ? (
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.05, x: 2, y: 2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => router.push("/settings")}
                className="neo-button py-2 px-3 md:px-4 bg-neo-yellow text-[9px] md:text-[10px] shadow-neo-active flex items-center gap-2 group border-[3px]"
              >
                <SettingsIcon className="w-3 h-3 group-hover:rotate-90 transition-transform" />
                <span className="hidden sm:inline">User Config</span>
                <span className="sm:hidden">Settings</span>
              </motion.button>

              <div className="neo-card py-1 px-2 md:py-1.5 md:px-3 bg-white flex items-center gap-2 shadow-neo border-[3px]">
                {user.avatarUrl && (
                  <div className="relative">
                    <Image
                      src={user.avatarUrl}
                      alt="Profile"
                      width={32}
                      height={32}
                      className="w-6 h-6 md:w-8 md:h-8 border-2 border-black relative z-10"
                    />
                    <div className="absolute inset-0 bg-neo-blue -translate-x-1 -translate-y-1 z-0" />
                  </div>
                )}
                <div className="hidden lg:block">
                  <p className="text-[10px] font-black uppercase leading-tight">
                    {user.username}
                  </p>
                  <p className="text-[8px] font-bold text-neo-green uppercase leading-tight tracking-[0.2em]">
                    {user.isGuest ? "Guest" : "Authorized"}
                  </p>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.05, x: 2, y: 2 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleLogout}
                className="neo-button py-2 px-3 md:px-4 bg-black text-white text-[9px] md:text-[10px] shadow-neo-active flex items-center gap-2 group border-[3px] border-neo-pink"
              >
                <Power className="w-3 h-3 group-hover:rotate-90 transition-transform text-neo-pink" />
                <span className="hidden sm:inline">Terminate Node</span>
                <span className="sm:hidden">Logoff</span>
              </motion.button>
            </div>
          ) : (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/api/auth/github";
                }}
                className="neo-button py-2 px-4 md:px-6 bg-neo-blue text-xs flex items-center gap-2 group shadow-neo-lg"
              >
                <LogIn className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="hidden sm:inline">Integrate GitHub</span>
                <span className="sm:hidden">Integrate</span>
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </motion.header>
  );
}
