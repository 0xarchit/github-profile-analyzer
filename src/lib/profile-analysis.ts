import type { AnalysisResult } from "@/types";

type ProfileAnalysisOptions = {
  force?: boolean;
  nosave?: boolean;
};

export class ProfileAnalysisError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ProfileAnalysisError";
    this.status = status;
    this.code = code;
  }
}

const buildProfileUrl = (username: string, options: ProfileAnalysisOptions) => {
  const params = new URLSearchParams({ username });

  if (options.force) {
    params.set("force", "true");
  }

  if (options.nosave) {
    params.set("nosave", "true");
  }

  return `/api/analyze?${params.toString()}`;
};

export async function fetchProfileAnalysis(
  username: string,
  options: ProfileAnalysisOptions = {},
): Promise<AnalysisResult> {
  const res = await fetch(buildProfileUrl(username, options), {
    cache: "no-store",
  });
  const result = await res.json().catch(() => ({}));

  if (res.status === 403 && result?.error === "Star required") {
    throw new ProfileAnalysisError(
      result?.message || "Star required",
      403,
      "STAR_REQUIRED",
    );
  }

  if (!res.ok) {
    throw new ProfileAnalysisError(
      result?.error || result?.message || "Diagnostic matrix failed",
      res.status,
      result?.error || "ANALYSIS_FAILED",
    );
  }

  return result as AnalysisResult;
}
