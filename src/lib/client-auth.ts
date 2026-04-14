export interface AuthIdentity {
  username: string;
  avatarUrl: string | null;
  githubId?: number;
  isGuest: boolean;
}

export async function fetchAuthIdentity(
  signal?: AbortSignal,
): Promise<AuthIdentity | null> {
  const sessionRes = await fetch("/api/auth/me", {
    signal,
    cache: "no-store",
    credentials: "same-origin",
  });

  if (sessionRes.ok) {
    const sessionData = await sessionRes.json();
    if (sessionData?.username) {
      return {
        username: sessionData.username,
        avatarUrl: sessionData.avatarUrl ?? null,
        githubId: sessionData.githubId,
        isGuest: false,
      };
    }
  }

  const guestRes = await fetch("/api/auth/me?guest=true", {
    signal,
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!guestRes.ok) {
    return null;
  }

  const guestData = await guestRes.json();
  if (!guestData?.username) {
    return null;
  }

  return {
    username: guestData.username,
    avatarUrl: `https://github.com/${guestData.username}.png`,
    isGuest: true,
  };
}
