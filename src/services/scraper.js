/* global document, window */
const { chromium } = require('playwright');

/**
 * Clean and normalise article text from webpage DOM.
 */
function cleanExtractedParagraphs(paragraphs) {
  const ignorePatterns = [
    /copyright|hak cipta|all rights reserved/i,
    /baca juga|simak juga|baca selengkapnya/i,
    /pilihan editor|artikel terkait/i,
    /download aplikasi|unduh aplikasi/i,
  ];

  return paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 25 && !ignorePatterns.some((pattern) => pattern.test(p)))
    .join('\n\n');
}

/**
 * Scrapes news article from Indonesian financial news websites.
 * Retries up to 3 times with backoff to handle transient CDN/bot-challenge responses
 * (e.g. CloudFront challenge pages) that return an empty body on the first attempt.
 * @param {string} url
 * @returns {Promise<{source: string, url: string, title: string, text: string, ogImage?: string}>}
 */
async function scrapeArticle(url) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error(`Invalid URL provided for scraping: ${url}`);
  }

  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAYS_MS = [0, 3000, 8000];
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (RETRY_DELAYS_MS[attempt - 1] > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }

    let browser = null;
    try {
      browser = await chromium.launch({
        headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-web-security',
        ],
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'id-ID',
        extraHTTPHeaders: {
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        },
      });

      const page = await context.newPage();

      // Block ads, analytics, and tracking to speed up load
      await page.route('**/*', (route) => {
        const blocked = ['doubleclick', 'googlesyndication', 'googletagmanager', 'googletagservices',
          'google-analytics', 'facebook.net', 'hotjar', 'mixpanel', 'chartbeat'];
        const reqUrl = route.request().url();
        if (blocked.some((b) => reqUrl.includes(b))) {
          return route.abort();
        }
        return route.continue();
      });

      // domcontentloaded is sufficient — kontan article text is server-rendered HTML,
      // not injected by JS. Using 'load' waits unnecessarily for CDN ad scripts.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1500);

      const articleData = await page.evaluate(() => {
        const ogTitle = document.querySelector('meta[property="og:title"]')?.content
          || document.querySelector('meta[name="twitter:title"]')?.content;
        const h1 = document.querySelector('h1')?.innerText?.trim();
        const docTitle = document.title?.trim();
        const title = h1 || ogTitle || docTitle || '';

        const ogSite = document.querySelector('meta[property="og:site_name"]')?.content;
        const { hostname } = window.location;
        const cleanHost = hostname.replace(/^www\./, '');
        const source = ogSite || (cleanHost ? cleanHost.charAt(0).toUpperCase() + cleanHost.slice(1) : 'News');

        const ogImage = document.querySelector('meta[property="og:image"]')?.content
          || document.querySelector('meta[name="og:image"]')?.content
          || document.querySelector('meta[name="twitter:image"]')?.content
          || null;

        const container = document.querySelector(
          '[class*="tmpt-desk-kon"], [class*="detail-kontan"], [class*="detail-news"], [class*="content-detail"], '
          + 'article, [class*="detail-text"], [class*="read__content"], '
          + '[class*="article-content"], [class*="article__body"], main',
        );
        const pElements = Array.from((container || document.body).querySelectorAll('p'));
        const rawParagraphs = pElements.map((el) => el.innerText || '');

        return {
          title,
          source,
          ogImage,
          paragraphs: rawParagraphs,
        };
      });

      await browser.close();
      browser = null;

      const text = cleanExtractedParagraphs(articleData.paragraphs);

      if (!text || text.length < 50) {
        // Likely a transient challenge/block page — retry if attempts remain.
        lastError = new Error(`Scraped text too short or blocked from URL: ${url}`);
        if (attempt < MAX_ATTEMPTS) {
          console.warn(`[scraper] attempt ${attempt}/${MAX_ATTEMPTS} got empty content, retrying…`);
          continue;
        }
        throw lastError;
      }

      return {
        source: articleData.source,
        url,
        title: articleData.title || 'Market Update',
        text,
        ogImage: articleData.ogImage,
      };
    } catch (err) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      lastError = err;
      // Re-throw immediately for non-recoverable errors (invalid URL, playwright crash, etc.)
      // Only retry on the "too short / blocked" signal.
      if (!err.message.includes('too short or blocked') || attempt >= MAX_ATTEMPTS) {
        throw new Error(`Failed to scrape article from ${url}: ${err.message}`);
      }
      console.warn(`[scraper] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}, retrying…`);
    }
  }

  // Exhausted all attempts
  throw new Error(`Failed to scrape article from ${url}: ${lastError?.message}`);
}

/**
 * Resolves input that can be either a URL or raw article text.
 * @param {Object} input - { url?: string, text?: string, title?: string, source?: string }
 * @returns {Promise<{source: string, url: string, title: string, text: string, ogImage?: string}>}
 */
async function resolveArticleInput(input = {}) {
  const {
    url,
    text,
    title,
    source,
  } = input;

  if (url && /^https?:\/\//i.test(url.trim())) {
    return scrapeArticle(url.trim());
  }

  if (text && text.trim().length > 0) {
    const trimmed = text.trim();
    const firstLine = trimmed.split('\n')[0].trim();
    const resolvedTitle = title || (firstLine.length <= 120 ? firstLine : `${firstLine.slice(0, 117)}...`);
    const resolvedSource = source || 'Editorial News';

    return {
      source: resolvedSource,
      url: url || '',
      title: resolvedTitle,
      text: trimmed,
      ogImage: null,
    };
  }

  throw new Error('No valid article URL or text provided');
}

module.exports = {
  scrapeArticle,
  resolveArticleInput,
};
