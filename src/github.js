// Client-side GitHub API access (unauthenticated, 60 req/hr).
// Every call degrades gracefully: on failure the baked data is used.

const GitHub = (() => {
  const API = 'https://api.github.com';
  const cache = new Map();

  async function getJSON(url) {
    if (cache.has(url)) return cache.get(url);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) return null;
      const data = await res.json();
      cache.set(url, data);
      return data;
    } catch {
      return null;
    }
  }

  // Refresh live stats for a grave (stars, dates). Mutates and returns it.
  async function enrich(grave) {
    const data = await getJSON(`${API}/repos/${grave.repo}`);
    if (!data) return grave;
    grave.stars = data.stargazers_count ?? grave.stars;
    grave.archived = data.archived;
    if (data.pushed_at) grave.lastCommitDate = data.pushed_at.slice(0, 10);
    if (data.created_at) grave.born = Number(data.created_at.slice(0, 4));
    grave.live = true;
    return grave;
  }

  // Last words: the final commit message + committer nickname.
  // Cached on the grave object itself (graves repeat across chunks).
  async function fetchLastCommit(grave) {
    if (grave.lastWords !== undefined) return grave.lastWords;
    const data = await getJSON(`${API}/repos/${grave.repo}/commits?per_page=1`);
    if (!Array.isArray(data) || !data.length || !data[0].commit) {
      grave.lastWords = null;
      return null;
    }
    const c = data[0];
    let msg = (c.commit.message || '').split('\n')[0].trim();
    if (msg.length > 100) msg = msg.slice(0, 97) + '…';
    const who = (c.author && c.author.login) || (c.commit.author && c.commit.author.name) || 'unknown';
    grave.lastWords = { msg, who, date: ((c.commit.author && c.commit.author.date) || '').slice(0, 10) };
    return grave.lastWords;
  }

  return { enrich, fetchLastCommit };
})();
