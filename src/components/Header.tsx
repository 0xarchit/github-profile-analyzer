"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
  const [hasStarred, setHasStarred] = useState(false);
  const [repoStars, setRepoStars] = useState<number | null>(null);
  const [user, setUser] = useState<AuthIdentity | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();

    const initialize = async () => {
      try {
        const authIdentity = await fetchAuthIdentity(controller.signal);
        setUser(authIdentity);

        if (authIdentity?.isGuest) {
          setHasStarred(true);
          const starRes = await fetch("/api/star-status?repoOnly=true", {
            signal: controller.signal,
            cache: "no-store",
            credentials: "same-origin",
          });
          if (!starRes.ok) {
            setRepoStars(null);
            return;
          }
          const starData = await starRes.json();
          if (typeof starData?.repoStars === "number") {
            setRepoStars(starData.repoStars);
          } else {
            setRepoStars(null);
          }
          return;
        } else if (!authIdentity) {
          setHasStarred(false);
        }

        const starRes = await fetch("/api/star-status", {
          signal: controller.signal,
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!starRes.ok) {
          if (!authIdentity?.isGuest) {
            setHasStarred(false);
          }
          setRepoStars(null);
          return;
        }

        const starData = await starRes.json();
        if (typeof starData?.repoStars === "number") {
          setRepoStars(starData.repoStars);
        } else {
          setRepoStars(null);
        }

        if (authIdentity && !authIdentity.isGuest) {
          setHasStarred(Boolean(starData?.hasStarred));
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Header initialization failed:", err);
        setHasStarred(false);
        setRepoStars(null);
      }
    };

    void initialize();

    return () => controller.abort();
  }, []);

  const handleLogout = async () => {
    try {
      setLogoutError(null);
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Logout Failure");
      }
      setUser(null);
      router.refresh();
      router.push("/");
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error("Logout Failure");
      console.error("Logout failed:", error.message);
      setLogoutError(error.message || "Logout failed");
    }
  };

  const headerClasses = floating
    ? "absolute top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-4 md:top-6 md:left-6 md:right-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 z-50"
    : "flex flex-col md:flex-row justify-between items-start md:items-center gap-6 z-50 border-b-8 border-black pb-8 md:pb-10 w-full";

  return (
    <header
      className={`${headerClasses} animate-in fade-in slide-in-from-top-4`}
    >
      <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-4 w-full sm:w-auto *:w-full sm:*:w-auto">
        <button
          onClick={() => router.push("/")}
          className="neo-card py-2 px-3 md:px-4 bg-white flex items-center justify-center gap-2 hover:shadow-neo-active hover:scale-105 active:scale-95 transition-all group border-[3px] text-[10px] md:text-xs"
        >
          <div className="w-2 h-2 bg-neo-green rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          <Home className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
          <span className="font-black uppercase tracking-tighter hidden xs:inline">
            GitScore Protocol
          </span>
        </button>

        <a
          href="https://github.com/0xarchit/github-profile-analyzer"
          target="_blank"
          className="neo-card py-2 px-3 md:px-4 bg-white flex items-center justify-center gap-2 hover:shadow-neo-active hover:scale-105 active:scale-95 transition-all group border-[3px]"
          rel="noopener noreferrer"
          aria-label="Open GitHub repository: github-profile-analyzer (opens in new tab)"
        >
          <FolderGit className="w-4 h-4 md:w-5 md:h-5 group-hover:rotate-12 transition-transform shrink-0" />
          <div className="flex items-center gap-1.5 bg-black text-white px-2 py-0.5 border-2 border-neo-blue text-[10px] md:text-xs font-heading">
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
      </div>

      <div className="flex flex-wrap items-center justify-start sm:justify-end gap-3 sm:gap-4 w-full">
        {children && (
          <div className="flex items-center justify-center gap-2 sm:gap-3 w-full *:flex-1 *:min-w-0 sm:w-auto sm:flex-wrap sm:justify-end sm:*:flex-none sm:*:min-w-fit">
            {children}
          </div>
        )}

        <div className="w-px h-6 bg-black/10 hidden md:block" />

        {user ? (
          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-3 w-full sm:w-auto">
            <button
              onClick={() => router.push("/settings")}
              className="neo-button py-1.5 px-2 sm:py-2 sm:px-3 md:px-4 bg-neo-yellow text-[8px] sm:text-[9px] md:text-[10px] shadow-neo-active hover:scale-105 active:scale-95 flex items-center justify-center gap-1 group border-[3px] whitespace-nowrap w-full sm:w-auto transition-all"
            >
              <SettingsIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 group-hover:rotate-90 transition-transform shrink-0" />
              <span className="hidden sm:inline">Config</span>
            </button>

            <div className="neo-card py-1 px-1.5 sm:py-1 sm:px-2 md:py-1.5 md:px-3 bg-white flex items-center justify-center gap-1 shadow-neo border-[3px] text-[8px] sm:text-[9px] md:text-[10px] w-full sm:w-auto">
              {user.avatarUrl && (
                <div className="relative shrink-0">
                  <Image
                    src={user.avatarUrl}
                    alt="Profile"
                    width={32}
                    height={32}
                    className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 border-2 border-black relative z-10"
                  />
                  <div className="absolute inset-0 bg-neo-blue -translate-x-1 -translate-y-1 z-0" />
                </div>
              )}
              <div className="hidden md:block">
                <p className="font-black uppercase leading-tight text-[8px] sm:text-[9px]">
                  {user.username}
                </p>
                <p className="text-[7px] font-bold text-neo-green uppercase leading-tight tracking-widest">
                  {user.isGuest ? "Guest" : "Auth"}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="neo-button py-1.5 px-2 sm:py-2 sm:px-3 md:px-4 bg-black text-white text-[8px] sm:text-[9px] md:text-[10px] shadow-neo-active hover:scale-105 active:scale-95 flex items-center justify-center gap-1 group border-[3px] border-neo-pink whitespace-nowrap w-full sm:w-auto transition-all"
            >
              <Power className="w-2.5 h-2.5 sm:w-3 sm:h-3 group-hover:rotate-90 transition-transform text-neo-pink shrink-0" />
              <span className="hidden sm:inline">Logoff</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              window.location.href = "/api/auth/github";
            }}
            className="neo-button py-1.5 px-2 sm:py-2 sm:px-3 md:px-4 bg-neo-blue text-[8px] sm:text-[9px] md:text-xs flex items-center justify-center gap-1 group shadow-neo-lg whitespace-nowrap w-full sm:w-auto hover:scale-105 active:scale-95 transition-all border-[3px]"
          >
            <LogIn className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 group-hover:-translate-x-1 transition-transform shrink-0" />
            <span className="hidden sm:inline">Connect</span>
          </button>
        )}

        {logoutError && (
          <p className="text-[10px] font-black uppercase text-neo-pink w-full sm:w-auto">
            {logoutError}
          </p>
        )}
      </div>
    </header>
  );
}
