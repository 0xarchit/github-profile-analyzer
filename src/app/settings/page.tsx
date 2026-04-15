"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Lock,
  Unlock,
  History,
  Clock,
  Check,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import { Header } from "@/components/Header";

import { UserSettings, Scan } from "@/lib/db";

interface SettingsData {
  settings: UserSettings;
  history: Scan[];
}

export default function SettingsPage() {
  const router = useRouter();
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users/settings")
      .then((res) => res.json())
      .then((resData) => {
        if (resData.error) throw new Error(resData.error);
        setData(resData);
      })
      .catch(() => {
        setError("Unable to load identity protocols.");
        router.push("/");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const updateSetting = async (payload: Partial<UserSettings>) => {
    if (updating || !data) return;
    setUpdating(true);

    try {
      const res = await fetch("/api/users/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Transmission failed");

      setData({
        ...data,
        settings: { ...data.settings, ...result.settings },
      });
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Settings update failed");
    } finally {
      setUpdating(false);
    }
  };

  const toggleLock = () => {
    if (!data) return;
    updateSetting({ profile_locked: !data.settings.profile_locked });
  };

  const toggleHistory = () => {
    if (!data) return;
    updateSetting({ keep_history: !data.settings.keep_history });
  };

  const togglePublicScans = () => {
    if (!data) return;
    updateSetting({ public_scans: !data.settings.public_scans });
  };

  const setPrimary = (scanId: string) => {
    updateSetting({ primary_scan_id: scanId });
  };

  if (loading)
    return (
      <div className="min-h-screen bg-neo-bg flex items-center justify-center">
        <div className="text-4xl font-heading animate-pulse uppercase">
          Syncing Protocol...
        </div>
      </div>
    );

  if (!data) return null;

  return (
    <main className="min-h-screen bg-neo-bg p-6 md:p-12 max-w-7xl mx-auto space-y-12">
      <Header />

      <div className="flex justify-between items-center border-b-8 border-black pb-8">
        <h1 className="text-4xl md:text-6xl font-heading uppercase tracking-tighter">
          IDENTITY <span className="text-neo-pink">PROTOCOLS</span>
        </h1>
        <div className="hidden sm:flex items-center gap-2 bg-neo-yellow px-4 py-2 border-4 border-black shadow-neo font-black text-[10px] uppercase">
          Control Plane Active
        </div>
      </div>

      {error && (
        <div className="neo-card bg-white border-4 border-black p-4 text-[10px] font-black uppercase tracking-wide text-neo-pink">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5 space-y-8">
          <section className="neo-card bg-white p-8 border-4 border-black shadow-neo-lg space-y-6">
            <div className="flex items-center gap-3 border-b-4 border-black pb-4">
              <Shield className="w-8 h-8 text-neo-blue" />
              <h2 className="text-2xl font-heading uppercase">Security Mesh</h2>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-neo-bg border-2 border-black">
                <div className="space-y-1">
                  <p className="font-heading uppercase text-sm">
                    Lock Vanity Profile
                  </p>
                  <p className="text-[10px] font-bold opacity-60">
                    Prevents public re-scans from updating your featured page.
                  </p>
                </div>
                <button
                  onClick={toggleLock}
                  disabled={updating}
                  aria-label={
                    data.settings.profile_locked
                      ? "Unlock profile"
                      : "Lock profile"
                  }
                  aria-pressed={data.settings.profile_locked}
                  className={`neo-button p-3 ${data.settings.profile_locked ? "bg-neo-green" : "bg-white"} shadow-neo-active hover:shadow-neo transition-all`}
                >
                  {data.settings.profile_locked ? (
                    <Lock className="w-6 h-6" />
                  ) : (
                    <Unlock className="w-6 h-6 border-black/20" />
                  )}
                </button>
              </div>

              <div className="flex justify-between items-center p-4 bg-neo-bg border-2 border-black">
                <div className="space-y-1">
                  <p className="font-heading uppercase text-sm">
                    Keep Scan History
                  </p>
                  <p className="text-[10px] font-bold opacity-60">
                    Stores up to 10 personal scan archives for temporal
                    analysis.
                  </p>
                </div>
                <button
                  onClick={toggleHistory}
                  disabled={updating}
                  aria-label={
                    data.settings.keep_history
                      ? "Disable scan history"
                      : "Enable scan history"
                  }
                  aria-pressed={data.settings.keep_history}
                  className={`neo-button p-3 ${data.settings.keep_history ? "bg-neo-green" : "bg-white"} shadow-neo-active hover:shadow-neo transition-all`}
                >
                  {data.settings.keep_history ? (
                    <Check className="w-6 h-6" />
                  ) : (
                    <X className="w-6 h-6 border-black/20" />
                  )}
                </button>
              </div>

              <div className="flex justify-between items-center p-4 bg-neo-bg border-2 border-black">
                <div className="space-y-1">
                  <p className="font-heading uppercase text-sm">
                    Public Scan Visibility
                  </p>
                  <p className="text-[10px] font-bold opacity-60">
                    Allows other users to open your archived snapshot URLs.
                  </p>
                </div>
                <button
                  onClick={togglePublicScans}
                  disabled={updating}
                  aria-label={
                    data.settings.public_scans
                      ? "Disable public scans"
                      : "Enable public scans"
                  }
                  aria-pressed={data.settings.public_scans}
                  className={`neo-button p-3 ${data.settings.public_scans ? "bg-neo-green" : "bg-white"} shadow-neo-active hover:shadow-neo transition-all`}
                >
                  {data.settings.public_scans ? (
                    <Eye className="w-6 h-6" />
                  ) : (
                    <EyeOff className="w-6 h-6 border-black/20" />
                  )}
                </button>
              </div>
            </div>
          </section>

          <div className="neo-card bg-neo-yellow p-6 border-4 border-black shadow-neo font-body font-bold text-xs italic leading-relaxed">
            &quot;When a profile is locked, viewers will only see your selected
            &apos;Primary Analysis&apos;. This ensures your public merit remains
            consistent until you decide to push a new update.&quot;
          </div>
        </div>

        <div className="lg:col-span-7 space-y-8">
          <section className="neo-card bg-white p-8 border-4 border-black shadow-neo-lg space-y-8">
            <div className="flex justify-between items-center border-b-4 border-black pb-4">
              <div className="flex items-center gap-3">
                <History className="w-8 h-8 text-neo-pink" />
                <h2 className="text-2xl font-heading uppercase">
                  Temporal Archives
                </h2>
              </div>
              <span className="bg-black text-white px-3 py-1 text-[10px] font-black uppercase">
                Max Capacity: 10
              </span>
            </div>

            <div className="space-y-4 max-h-150 overflow-y-auto pr-2 custom-scrollbar">
              {data?.history.map((scan: Scan) => (
                <div
                  key={scan.id}
                  className={`neo-card p-4 border-2 border-black bg-white flex justify-between items-center hover:shadow-neo transition-all ${data.settings.primary_scan_id === scan.id ? "ring-4 ring-neo-green" : ""}`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-heading uppercase text-md">
                        Analysis: {scan.username}
                      </p>
                      {data.settings.primary_scan_id === scan.id && (
                        <span className="bg-neo-green text-black px-1.5 py-0.5 text-[8px] font-black uppercase">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="flex items-center gap-2 text-[10px] font-bold opacity-50">
                      <Clock className="w-3 h-3" />
                      {new Date(scan.created_at).toLocaleString()}
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() =>
                          router.push(`/${scan.username}/${scan.id}`)
                        }
                        className="neo-button bg-neo-blue text-[10px] py-1.5 px-2 disabled:opacity-50"
                      >
                        View Archive
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setPrimary(scan.id)}
                      disabled={
                        updating || data.settings.primary_scan_id === scan.id
                      }
                      className="neo-button bg-neo-blue text-[10px] py-2 px-3 disabled:opacity-50"
                    >
                      Set Principal
                    </button>
                  </div>
                </div>
              ))}

              {data.history.length === 0 && (
                <div className="text-center py-12 border-4 border-dashed border-black/10">
                  <p className="font-heading uppercase opacity-20 text-2xl">
                    No Archives Found
                  </p>
                  <button
                    onClick={() => router.push("/")}
                    className="text-[10px] font-black uppercase underline mt-2"
                  >
                    Trigger First Scan
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
