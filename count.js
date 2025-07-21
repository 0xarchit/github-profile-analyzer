export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === '/cnt') {
      // Increment counter in D1
      const { results } = await env.DB.prepare(
        'INSERT INTO count (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET hits = hits + 1 RETURNING hits'
      ).run();
      const hits = results[0]?.hits || 0;

      return new Response(JSON.stringify({ hits }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/add') {
      const username = url.searchParams.get('username');
      if (!username) {
        return new Response('Missing username parameter', { status: 400 });
      }

      // Add or update username with count increment in D1
      await env.DB.prepare(
        'INSERT INTO user (username, count) VALUES (?, 1) ON CONFLICT (username) DO UPDATE SET count = count + 1'
      ).bind(username).run();

      return new Response('Username added/updated', { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  } catch (e) {
    console.error(e);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// D1 Database Schema
// CREATE TABLE count (id INTEGER PRIMARY KEY, hits INTEGER DEFAULT 0);
// CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, count INTEGER DEFAULT 0);