"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

export function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const lastCheck = useRef<number>(0);

  useEffect(() => {
    const isProtected =
      pathname === "/settings" || pathname.startsWith("/settings/");

    const checkSession = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastCheck.current < 30000) return;
      lastCheck.current = now;

      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const session = await res.json();

        if (!session && isProtected) {
          router.push("/");
          router.refresh();
        }
      } catch {
        if (isProtected) {
          router.push("/");
          router.refresh();
        }
      }
    };

    if (isProtected) {
      checkSession(true);
    } else {
      void checkSession();
    }

    const handleFocus = () => {
      if (isProtected) {
        void checkSession();
      }
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [pathname, router]);

  return null;
}
