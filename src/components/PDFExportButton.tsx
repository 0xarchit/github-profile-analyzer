"use client";

import { Suspense, useEffect, useRef } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { ProfilePDF } from "./ProfilePDF";
import { AnalysisResult } from "@/types";
import { FileDown } from "lucide-react";
import { reportClientError } from "@/lib/actions/report-client-error";

interface PDFExportButtonProps {
  data: AnalysisResult;
  filename: string;
  label?: string;
  shortLabel?: string;
}

interface PDFLinkStateViewProps {
  loading: boolean;
  errorMessage: string;
  label: string;
  shortLabel: string;
  lastErrorRef: React.MutableRefObject<string | null>;
}

function PDFLinkStateView({
  loading,
  errorMessage,
  label,
  shortLabel,
  lastErrorRef,
}: PDFLinkStateViewProps) {
  useEffect(() => {
    if (!errorMessage || lastErrorRef.current === errorMessage) {
      return;
    }
    lastErrorRef.current = errorMessage;
    void reportClientError({
      source: "PDF_GENERATION",
      message: errorMessage,
      url: typeof window !== "undefined" ? window.location.href : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    }).catch(() => null);
  }, [errorMessage, lastErrorRef]);

  return (
    <span
      title={loading ? "Compiling..." : shortLabel}
      className={`neo-button bg-neo-blue text-[10px] md:text-sm flex items-center justify-center gap-2 group shadow-neo-active hover:shadow-neo transition-all ${loading ? "opacity-50 pointer-events-none" : ""}`}
    >
      <FileDown className="w-3 h-3 md:w-4 md:h-4 group-hover:translate-y-0.5 transition-transform" />
      <span className="hidden sm:inline">
        {loading ? "Compiling..." : label}
      </span>
    </span>
  );
}

export function PDFExportButton({
  data,
  filename,
  label = "Intel.Export()",
  shortLabel = "Export",
}: PDFExportButtonProps) {
  const lastErrorRef = useRef<string | null>(null);

  return (
    <Suspense fallback={null}>
      <PDFDownloadLink
        document={<ProfilePDF data={data} />}
        fileName={filename}
      >
        {({ loading, error }) => {
          const errorMessage =
            typeof error === "string" ? error : error?.message || "";
          return (
            <PDFLinkStateView
              loading={loading}
              errorMessage={errorMessage}
              label={label}
              shortLabel={shortLabel}
              lastErrorRef={lastErrorRef}
            />
          );
        }}
      </PDFDownloadLink>
    </Suspense>
  );
}
