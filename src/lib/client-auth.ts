export interface AuthIdentity {
  username: string;
  avatarUrl: string | null;
  githubId?: number;
  isGuest: boolean;
}

export async function fetchAuthIdentity(
  signal?: AbortSignal,
): Promise<AuthIdentity | null> {
  const res = await fetch("/api/auth/me?guest=true", {
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
  };
}
