"use client";

import { Suspense } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { ProfilePDF } from "./ProfilePDF";
import { AnalysisResult } from "@/types";
import { FileDown } from "lucide-react";

interface PDFExportButtonProps {
  data: AnalysisResult;
  filename: string;
  label?: string;
  shortLabel?: string;
}

export function PDFExportButton({
  data,
  filename,
  label = "Intel.Export()",
  shortLabel = "Export",
}: PDFExportButtonProps) {
  return (
    <Suspense fallback={null}>
      <PDFDownloadLink
        document={<ProfilePDF data={data} />}
        fileName={filename}
      >
        {({ loading }) => (
          <button
            className="neo-button bg-neo-blue text-[10px] md:text-sm disabled:opacity-50 flex items-center gap-2 group shadow-neo-active hover:shadow-neo transition-all"
            disabled={loading}
          >
            <FileDown className="w-3 h-3 md:w-4 md:h-4 group-hover:translate-y-0.5 transition-transform" />
            <span className="hidden sm:inline">
              {loading ? "Compiling..." : label}
            </span>
            <span className="sm:hidden">{shortLabel}</span>
          </button>
        )}
      </PDFDownloadLink>
    </Suspense>
  );
}
