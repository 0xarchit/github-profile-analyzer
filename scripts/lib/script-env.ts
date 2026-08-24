import { readFileSync } from "fs";
import { resolve } from "path";

export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
        }
      }
    } catch {}
  }
}

export function pickToken(): string {
  const direct = process.env.GITHUB_TOKEN?.trim();
  if (direct) return direct;
  for (const key of ["GITHUB_TOKENS", "GITHUB_PAT_TOKENS"]) {
    const first = (process.env[key] || "")
      .split(",")
      .map((t) => t.trim())
      .find(Boolean);
    if (first) return first;
  }
  console.error("No token found. Set GITHUB_TOKEN or GITHUB_TOKENS in .env");
  process.exit(1);
}
