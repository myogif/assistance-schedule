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
 * @param {string} url
 * @returns {Promise<{source: string, url: string, title: string, text: string, ogImage?: string}>}
 */
async function scrapeArticle(url) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error(`Invalid URL provided for scraping: ${url}`);
  }

  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
  let browser = null;

  try {
    browser = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

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

      const container = document.querySelector('article, [class*="detail-text"], [class*="read__content"], [class*="article-content"], main');
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
      throw new Error(`Scraped text too short or blocked from URL: ${url}`);
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
    throw new Error(`Failed to scrape article from ${url}: ${err.message}`);
  }
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
