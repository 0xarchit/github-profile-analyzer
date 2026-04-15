import { SessionGuard } from "@/components/SessionGuard";
import type { ReactNode } from "react";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionGuard />
      {children}
    </>
  );
}
