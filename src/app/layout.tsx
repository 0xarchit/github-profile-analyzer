import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Outfit } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

import { SessionGuard } from "@/components/SessionGuard";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
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
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className={`${bricolage.variable} ${outfit.variable} font-body bg-neo-bg text-black min-h-full flex flex-col`}
      >
        <SessionGuard />
        {children}
      </body>
    </html>
  );
}
