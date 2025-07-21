// demo logic from contribution graph geenration
export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const username = url.searchParams.get('username');
      if (!username) {
        return new Response(JSON.stringify({ error: 'Username is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const token = "";
      if (!token) {
        return new Response(JSON.stringify({ error: 'GitHub token not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const query = `
        {
          user(login: "${username}") {
            contributionsCollection {
              contributionCalendar {
                totalContributions
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

      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Cloudflare-Worker-GitHub-API',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: `GitHub API error: ${response.status} - ${errorText}` }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const result = await response.json();
      if (result.errors || !result.data.user) {
        return new Response(JSON.stringify({ error: result.errors || 'User not found' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { weeks } = result.data.user.contributionsCollection.contributionCalendar;

      const cellSize = 10;
      const cellMargin = 2;
      const weeksCount = weeks.length;
      const daysCount = 7;
      const width = weeksCount * (cellSize + cellMargin) + cellMargin;
      const height = daysCount * (cellSize + cellMargin) + cellMargin;

      let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
      svg += '<rect width="100%" height="100%" fill="#1a1a1a"/>';

      const maxContributions = Math.max(
        ...weeks.flatMap(week => week.contributionDays.map(day => day.contributionCount))
      ) || 1;

      weeks.forEach((week, weekIndex) => {
        week.contributionDays.forEach((day, dayIndex) => {
          const x = weekIndex * (cellSize + cellMargin);
          const y = dayIndex * (cellSize + cellMargin);
          const intensity = maxContributions ? Math.min(day.contributionCount / maxContributions, 1) : 0;
          const fill = day.contributionCount === 0 ? '#2f3727' : `rgba(0, 255, 0, ${0.2 + intensity * 0.8})`;
          svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fill}"/>`;
        });
      });

      svg += '</svg>';

      return new Response(svg, {
        headers: { 'Content-Type': 'image/svg+xml' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: `Worker error: ${error.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};