import { loadEnvConfig } from "@next/env";

// Load Next.js environment variables (.env, .env.local, etc.)
loadEnvConfig(process.cwd());

process.env.GITHUB_TOKENS = process.env.GITHUB_TOKENS || "test-token-1,test-token-2";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-at-least-32-characters-long";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "test-encryption-key-32-characters!";
