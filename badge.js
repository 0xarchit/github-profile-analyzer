// demo logic for badges extraction

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const badgeAssets = {
  "pull-shark": "https://github.githubassets.com/assets/pull-shark-default-498c279a747d.png",
  "starstruck": "https://github.githubassets.com/assets/starstruck-default--light-medium-65b31ef2251e.png",
  "pair-extraordinaire": "https://github.githubassets.com/assets/pair-extraordinaire-default-579438a20e01.png",
  "galaxy-brain": "https://github.githubassets.com/assets/galaxy-brain-default-847262c21056.png",
  "yolo": "https://github.githubassets.com/assets/yolo-default-be0bbff04951.png",
  "quickdraw": "https://github.githubassets.com/assets/quickdraw-default--light-medium-5450fadcbe37.png",
  "highlight": "https://github.githubassets.com/assets/highlight-default--light-medium-30e41ef7e6e7.png",
  "community": "https://github.githubassets.com/assets/community-default-4c5bc57b9b55.png",
  "deep-diver": "https://github.githubassets.com/assets/deep-diver-default--light-medium-a7be3c095c3d.png",
  "arctic-code-vault-contributor": "https://github.githubassets.com/assets/arctic-code-vault-contributor-default-f5b6474c6028.png",
  "public-sponsor": "https://github.githubassets.com/assets/public-sponsor-default-4e30fe60271d.png",
  "heart-on-your-sleeve": "https://github.githubassets.com/assets/heart-on-your-sleeve-default-28aa2b2f7ffb.png",
  "open-sourcerer": "https://github.githubassets.com/assets/open-sourcerer-default-64b1f529dcdb.png"
};

async function checkAchievementStatus(username, slug) {
  const url = `https://github.com/${encodeURIComponent(username)}?tab=achievements&achievement=${slug}`;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Cloudflare-Worker/1.0',
        'Accept': '*/*'
      }
    });
    return res.status === 200 ? slug : null;
  } catch {
    return null;
  }
}

async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const username = url.searchParams.get("username");
    if (!username) throw new Error("No username provided");

    const slugs = Object.keys(badgeAssets);
    const unlocked = await Promise.all(slugs.map(slug => checkAchievementStatus(username, slug)));

    const responseObj = {};
    unlocked.filter(Boolean).forEach(slug => {
      responseObj[slug] = badgeAssets[slug];
    });

    return new Response(JSON.stringify(responseObj, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=900'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
