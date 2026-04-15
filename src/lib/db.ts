import { neon } from "@neondatabase/serverless";
import { encrypt, decrypt } from "./encryption";
import { ValidatedAnalysisResult } from "./validation";

const DATABASE_WRITE = (process.env.DATABASE_WRITE || "").trim();
const DATABASE_READS = (process.env.DATABASE_READ || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!DATABASE_WRITE) {
  throw new Error("DATABASE_WRITE environment variable is required");
}

const DEFAULT_SETTINGS: UserSettings = {
  profile_locked: true,
  keep_history: true,
  public_scans: false,
  primary_scan_id: null,
};

export const sql = neon(DATABASE_WRITE);

export function getReadSql() {
  if (DATABASE_READS.length === 0) return sql;
  const dbUrl =
    DATABASE_READS[Math.floor(Math.random() * DATABASE_READS.length)];
  return neon(dbUrl);
}

export interface UserSettings {
  profile_locked: boolean;
  keep_history: boolean;
  public_scans: boolean;
  primary_scan_id: string | null;
}

export interface User {
  id: number;
  github_id: number;
  username: string;
  avatar_url: string | null;
  access_token: string;
  settings: UserSettings;
  created_at: string;
  updated_at: string;
}

export interface Scan {
  id: string;
  user_id: number;
  username: string;
  data: ValidatedAnalysisResult & { isStarred?: boolean; cachedAt?: string };
  created_at: string;
}

function normalizeSettings(
  settings: Partial<UserSettings> | null | undefined,
): UserSettings {
  return {
    profile_locked: settings?.profile_locked ?? DEFAULT_SETTINGS.profile_locked,
    keep_history: settings?.keep_history ?? DEFAULT_SETTINGS.keep_history,
    public_scans: settings?.public_scans ?? DEFAULT_SETTINGS.public_scans,
    primary_scan_id:
      settings?.primary_scan_id ?? DEFAULT_SETTINGS.primary_scan_id,
  };
}

function normalizeSettingsPatch(
  settings: Partial<UserSettings>,
): Partial<UserSettings> {
  const patch: Partial<UserSettings> = {};
  if (typeof settings.profile_locked === "boolean")
    patch.profile_locked = settings.profile_locked;
  if (typeof settings.keep_history === "boolean")
    patch.keep_history = settings.keep_history;
  if (typeof settings.public_scans === "boolean")
    patch.public_scans = settings.public_scans;
  if (
    typeof settings.primary_scan_id === "string" ||
    settings.primary_scan_id === null
  ) {
    patch.primary_scan_id = settings.primary_scan_id;
  }
  return patch;
}

async function materializeUser(
  row: unknown,
  includeAccessToken = false,
): Promise<User | null> {
  if (!row) return null;
  const user = row as User;
  user.settings = normalizeSettings(user.settings);
  if (includeAccessToken) {
    user.access_token = await decrypt(user.access_token);
  } else {
    user.access_token = "";
  }
  return user;
}

export async function getUserByGithubId(
  githubId: number,
): Promise<User | null> {
  const readSql = getReadSql();
  const rows =
    await readSql`SELECT * FROM users WHERE github_id = ${githubId} LIMIT 1`;
  return materializeUser(rows[0]);
}

export async function getUserById(id: number): Promise<User | null> {
  const readSql = getReadSql();
  const rows = await readSql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
  return materializeUser(rows[0]);
}

export async function getUserByUsername(
  username: string,
): Promise<User | null> {
  const readSql = getReadSql();
  const rows =
    await readSql`SELECT * FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1`;
  return materializeUser(rows[0]);
}
export async function upsertUser(user: {
  github_id: number;
  username: string;
  avatar_url: string | null;
  access_token: string;
}): Promise<User> {
  const { github_id, username, avatar_url, access_token } = user;
  const encryptedToken = access_token ? await encrypt(access_token) : "";

  const rows = await sql`
    INSERT INTO users (github_id, username, avatar_url, access_token, settings)
    VALUES (${github_id}, ${username}, ${avatar_url}, ${encryptedToken}, ${JSON.stringify(DEFAULT_SETTINGS)}::jsonb)
    ON CONFLICT (github_id) DO UPDATE SET
      username = EXCLUDED.username,
      avatar_url = EXCLUDED.avatar_url,
      access_token = EXCLUDED.access_token,
      updated_at = NOW()
    RETURNING *
  `;

  const result = rows[0] as User;
  result.access_token = await decrypt(result.access_token);
  result.settings = normalizeSettings(result.settings);
  return result;
}

export async function updateUserSettings(
  userId: number,
  settings: Partial<UserSettings>,
): Promise<void> {
  const safeSettings = normalizeSettingsPatch(settings);
  if (Object.keys(safeSettings).length === 0) return;

  if (safeSettings.primary_scan_id) {
    const scanRows = await sql`
      SELECT 1
      FROM scans
      WHERE id = ${safeSettings.primary_scan_id}
        AND user_id = ${userId}
      LIMIT 1
    `;
    if (scanRows.length === 0) {
      throw new Error("INVALID_PRIMARY_SCAN");
    }
  }

  await sql`
    UPDATE users 
      SET settings = COALESCE(settings, '{}'::jsonb) || ${JSON.stringify(safeSettings)}::jsonb
    WHERE id = ${userId}
  `;
}

export async function saveScan(
  userId: number,
  username: string,
  data: ValidatedAnalysisResult,
): Promise<Scan> {
  const rows = await sql`
    WITH inserted AS (
      INSERT INTO scans (user_id, username, data)
      VALUES (${userId}, ${username}, ${JSON.stringify(data)}::jsonb)
      RETURNING *
    ),
    ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY user_id
               ORDER BY created_at DESC, id DESC
             ) AS row_num
      FROM scans
      WHERE user_id = ${userId}
    ),
    deleted AS (
      DELETE FROM scans
      WHERE id IN (SELECT id FROM ranked WHERE row_num > 10)
      RETURNING id
    )
    SELECT * FROM inserted
  `;
  return rows[0] as Scan;
}

export async function getScanById(id: string): Promise<Scan | null> {
  const readSql = getReadSql();
  const rows = await readSql`SELECT * FROM scans WHERE id = ${id} LIMIT 1`;
  return (rows[0] as Scan) || null;
}

export async function getUserScans(userId: number): Promise<Scan[]> {
  const readSql = getReadSql();
  return (await readSql`SELECT * FROM scans WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 10`) as Scan[];
}

export async function getLatestSelfScan(
  userId: number,
  username: string,
): Promise<Scan | null> {
  const readSql = getReadSql();
  const rows = await readSql`
    SELECT * FROM scans 
    WHERE user_id = ${userId} AND LOWER(username) = LOWER(${username}) 
    ORDER BY created_at DESC LIMIT 1
  `;
  return (rows[0] as Scan) || null;
}
