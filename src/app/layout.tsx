import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Outfit, Syne } from "next/font/google";
import "./globals.css";

import { MaintenancePage } from "@/components/MaintenancePage";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

function getMetadataBase(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return new URL("http://localhost:3000");
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "GitHub Profile Analyzer | Decode Your Engineering DNA",
  description:
    "The high-fidelity protocol for technical identity analysis. Roast your code, quantify your impact, and upgrade your career trajectory.",
  icons: {
    icon: "/github-profile-analyzer.webp",
    apple: "/github-profile-analyzer.webp",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isMaintenanceMode =
    process.env.MODE === "MAINT" || process.env.NEXT_PUBLIC_MODE === "MAINT";

  const maintTitle =
    process.env.MAINT_TITLE || process.env.NEXT_PUBLIC_MAINT_TITLE;
  const maintDesc =
    process.env.MAINT_DESC || process.env.NEXT_PUBLIC_MAINT_DESC;

  if (isMaintenanceMode) {
    if (!maintTitle) {
      console.warn(
        "[MAINTENANCE MODE WARNING] Mandatory environment variable 'MAINT_TITLE' is missing."
      );
    }
    if (!maintDesc) {
      console.warn(
        "[MAINTENANCE MODE WARNING] Mandatory environment variable 'MAINT_DESC' is missing."
      );
    }
  }

  return (
    <html lang="en" className="h-full antialiased">
      <body
        className={`${bricolage.variable} ${outfit.variable} ${syne.variable} font-body bg-neo-bg text-black min-h-full flex flex-col`}
      >
        {isMaintenanceMode ? (
          <MaintenancePage
            title={maintTitle || "SYSTEM UNDER MAINTENANCE"}
            desc={
              maintDesc ||
              "System is under scheduled maintenance. We will be back online shortly."
            }
          />
        ) : (
          children
        )}
      </body>
    </html>
  );
}
