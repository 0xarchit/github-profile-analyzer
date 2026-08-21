export interface RateLimitResource {
  limit: number;
  remaining: number;
  reset: number;
}

export interface AuthIdentity {
  username: string;
  avatarUrl: string | null;
  githubId?: number;
  isGuest: boolean;
  rateLimit?: {
    core: RateLimitResource;
    graphql: RateLimitResource;
  } | null;
}

export async function fetchAuthIdentity(
  signal?: AbortSignal,
  options?: { rateLimit?: boolean },
): Promise<AuthIdentity | null> {
  const url = `/api/auth/me?guest=true${options?.rateLimit ? "&rate_limit=true" : ""}`;
  const res = await fetch(url, {
    signal,
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  if (!data?.username) {
    return null;
  }

  return {
    username: data.username,
    avatarUrl: data.isGuest
      ? `https://github.com/${data.username}.png`
      : (data.avatarUrl ?? null),
    githubId: data.githubId,
    isGuest: Boolean(data.isGuest),
    rateLimit: data.rateLimit ?? null,
  };
}
