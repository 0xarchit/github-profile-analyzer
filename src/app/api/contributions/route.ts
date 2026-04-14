import { NextRequest, NextResponse } from "next/server";
import { UsernameSchema } from "@/lib/validation";
import { getSession, getGuestSession } from "@/lib/auth";
import { checkStarStatus } from "@/lib/github";
import { getCachedData, setCachedData } from "@/lib/redis";

export const runtime = "edge";

const GITHUB_TOKENS = (process.env.GITHUB_TOKENS || "")
  .split(",")
  .filter(Boolean);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const usernameParam = searchParams.get("username");

  if (usernameParam) {
    const parsed = UsernameSchema.safeParse(usernameParam);
    if (!parsed.success) {
      return new NextResponse(JSON.stringify({ error: "INVALID_ID_SPEC" }), {
        status: 400,
      });
    }
  }

  const username = usernameParam;

  const session = await getSession();
  const userToken = session?.accessToken;

  if (!username && !session) {
    return new Response(JSON.stringify({ error: "Identification required" }), {
      status: 400,
    });
  }

  const targetUser = username || session?.username || "";
  if (!targetUser) {
    return new Response(
      JSON.stringify({ error: "Target identity not resolved" }),
      { status: 400 },
    );
  }

  const isOwnerTarget = Boolean(
    session?.username &&
    session.username.toLowerCase() === targetUser.toLowerCase(),
  );
  const guestUsername = session ? null : await getGuestSession();
  const verifierUsername = session?.username ?? guestUsername;

  let isStarred = false;
  if (isOwnerTarget) {
    isStarred = true;
  } else if (verifierUsername) {
    isStarred = await checkStarStatus(verifierUsername, userToken);
  } else {
    isStarred = false;
  }

  if (!isStarred) {
    return new Response(
      JSON.stringify({
        error: "Star required",
        message:
          "Support the analyzer to unlock rhythmic visualization shards.",
      }),
      { status: 403 },
    );
  }

  const cacheKey = `contributions_svg:${targetUser.toLowerCase()}`;
  const cachedSvg = await getCachedData(cacheKey);
  if (cachedSvg && typeof cachedSvg === "string") {
    return new Response(cachedSvg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
        "X-Cache": "HIT",
      },
    });
  }

  const token = GITHUB_TOKENS[Math.floor(Math.random() * GITHUB_TOKENS.length)];
  if (!token) {
    return NextResponse.json(
      { error: "GITHUB_TOKENS environment variable is required" },
      { status: 500 },
    );
  }
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "GitScore-Retro/1.0",
      },
      body: JSON.stringify({
        query,
        variables: { login: targetUser },
      }),
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `GitHub API error: ${res.status}` }),
        {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const result = await res.json();
    const weeks =
      result.data?.user?.contributionsCollection?.contributionCalendar?.weeks ||
      [];

    const cellSize = 10;
    const cellMargin = 2;
    const daysCount = 7;
    const width = weeks.length * (cellSize + cellMargin) + cellMargin;
    const height = daysCount * (cellSize + cellMargin) + cellMargin;

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += '<rect width="100%" height="100%" fill="#1a1a1a" rx="4"/>';

    const maxContrib = Math.max(
      1,
      ...weeks.flatMap(
        (w: { contributionDays: { contributionCount: number }[] }) =>
          w.contributionDays.map(
            (d: { contributionCount: number }) => d.contributionCount,
          ),
      ),
    );

    weeks.forEach(
      (
        week: { contributionDays: { contributionCount: number }[] },
        wi: number,
      ) => {
        week.contributionDays.forEach(
          (day: { contributionCount: number }, di: number) => {
            const x = wi * (cellSize + cellMargin) + cellMargin;
            const y = di * (cellSize + cellMargin) + cellMargin;
            const intensity = Math.min(day.contributionCount / maxContrib, 1);
            const fill =
              day.contributionCount === 0
                ? "#2d333b"
                : `rgba(57, 211, 83, ${0.2 + intensity * 0.8})`;
            svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fill}" rx="2"/>`;
          },
        );
      },
    );

    await setCachedData(cacheKey, svg, 3600);

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
        "X-Cache": "MISS",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: `Failed to generate graph: ${message}` }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
