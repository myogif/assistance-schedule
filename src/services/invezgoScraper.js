/**
 * Invezgo Blog Scraper
 *
 * Fetches the article list from https://invezgo.com/id/blog using plain HTTP fetch
 * (no Playwright needed — page is server-rendered).
 *
 * Parses structured JSON-LD data embedded in the page (Blog/@graph[0].mainEntity.itemListElement)
 * which provides clean title, URL, and datePublished without HTML parsing fragility.
 */

const BLOG_URL = 'https://invezgo.com/id/blog';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
};

/**
 * Formats an ISO date string to a human-readable Indonesian locale date.
 * e.g. "2026-11-01T00:42:57.816Z" → "1 Nov 2026"
 * @param {string} iso
 * @returns {string}
 */
function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });
  } catch {
    return iso.slice(0, 10); // fallback: YYYY-MM-DD
  }
}

/**
 * Fetches the article list from https://invezgo.com/id/blog.
 *
 * Returns articles sorted newest-first (as ordered by the page's JSON-LD).
 * Each item: { title, url, date, description }
 *   - title:       full article title (clean, no duplication)
 *   - url:         canonical article URL
 *   - date:        human-readable publication date in Indonesian locale
 *   - description: short subtitle/teaser from JSON-LD description field
 *
 * Throws on network failure or non-200 HTTP status.
 * Returns [] if JSON-LD is missing or has no items (page structure changed).
 *
 * @returns {Promise<Array<{title: string, url: string, date: string, description: string}>>}
 */
async function fetchInvezgoBlogList() {
  let response;
  try {
    response = await fetch(BLOG_URL, { headers: FETCH_HEADERS });
  } catch (err) {
    throw new Error(`invezgoScraper: network error: ${err.message}`);
  }

  if (!response.ok) {
    throw new Error(`invezgoScraper: fetch failed with status ${response.status}`);
  }

  const html = await response.text();

  const scriptRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

  // Parse all JSON-LD blocks; ignore malformed ones
  const graphs = [...html.matchAll(scriptRegex)]
    .map(([, content]) => {
      try { return JSON.parse(content); } catch { return null; }
    })
    .filter(Boolean)
    .map((d) => (Array.isArray(d['@graph']) ? d['@graph'] : []))
    .flat();

  // Find the Blog node that carries mainEntity.itemListElement
  const blogNode = graphs.find((node) => {
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    return types.includes('Blog') && Array.isArray(node.mainEntity?.itemListElement);
  });

  if (!blogNode || blogNode.mainEntity.itemListElement.length === 0) {
    // JSON-LD not found or changed — return empty list, caller handles gracefully
    return [];
  }

  return blogNode.mainEntity.itemListElement
    .filter((entry) => entry.item && entry.item.url && entry.item.name)
    .map((entry) => ({
      title: entry.item.name,
      url: entry.item.url,
      date: formatDate(entry.item.datePublished),
      description: entry.item.description || '',
    }));
}

module.exports = { fetchInvezgoBlogList };
