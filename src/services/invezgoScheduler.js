/**
 * Invezgo Blog Auto-Broadcast Scheduler
 *
 * Polls https://invezgo.com/id/blog every INVEZGO_CHECK_INTERVAL_MS milliseconds
 * (default 30 minutes), compares against already-sent URLs, and sends each new
 * article to the configured Telegram group/channel as a formatted HTML message.
 *
 * Required env:
 *   TELEGRAM_NEWS_GROUP_ID  — target group/channel ID (e.g. -1001234567890)
 *
 * Optional env:
 *   INVEZGO_CHECK_INTERVAL_MS — polling interval in ms (default: 1800000 = 30 min)
 */

const { fetchInvezgoBlogList } = require('./invezgoScraper');

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
/** Delay between consecutive sendMessage calls to avoid Telegram 429 rate-limit */
const SEND_DELAY_MS = 1500;

/**
 * Builds the HTML message text for a single article.
 * @param {{ title: string, url: string, date: string, description: string }} article
 * @returns {string}
 */
function buildMessage(article) {
  // Escape HTML special chars for Telegram HTML parse_mode
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = [
    '📰 <b>INVEZGO — Artikel Baru</b>',
    '',
    `<b>${esc(article.title)}</b>`,
  ];

  if (article.description) {
    lines.push(`<i>${esc(article.description)}</i>`);
  }

  if (article.date) {
    lines.push(`🗓 ${esc(article.date)}`);
  }

  lines.push('');
  lines.push(`🔗 <a href="${esc(article.url)}">Baca selengkapnya</a>`);

  return lines.join('\n');
}

/**
 * Starts the Invezgo blog polling scheduler.
 *
 * Fires an initial check immediately on start, then repeats on the configured interval.
 * Uses an in-memory Set for deduplication — on process restart, at most one batch of
 * previously-seen articles may be re-sent (acceptable trade-off vs. DB dependency).
 *
 * @param {import('telegraf').Telegraf} bot  Live Telegraf instance with a valid token.
 */
function startInvezgoScheduler(bot) {
  const groupId = process.env.TELEGRAM_NEWS_GROUP_ID
    ? process.env.TELEGRAM_NEWS_GROUP_ID.trim()
    : '';

  if (!groupId) {
    console.warn('[invezgoScheduler] TELEGRAM_NEWS_GROUP_ID not set, scheduler disabled.');
    return;
  }

  const intervalMs = parseInt(process.env.INVEZGO_CHECK_INTERVAL_MS, 10) || DEFAULT_INTERVAL_MS;

  /** @type {Set<string>} URLs already sent this session */
  const sentUrls = new Set();

  /**
   * Sends a single article to the group and marks it sent.
   * Returns a promise that resolves after the send delay.
   * Never rejects — errors are logged, URL is still marked sent.
   * @param {object} article
   * @returns {Promise<void>}
   */
  function sendArticle(article) {
    return bot.telegram
      .sendMessage(groupId, buildMessage(article), {
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      })
      .then(() => {
        console.log(`[invezgoScheduler] Sent: ${article.title.slice(0, 60)}`);
      })
      .catch((err) => {
        console.error(
          `[invezgoScheduler] Failed to send "${article.title.slice(0, 40)}":`,
          err.message,
        );
      })
      .then(() => {
        // Mark sent regardless of outcome to prevent retry-spam on persistent errors
        sentUrls.add(article.url);
        // Rate-limit guard: wait between sends
        return new Promise((resolve) => { setTimeout(resolve, SEND_DELAY_MS); });
      });
  }

  function checkAndSend() {
    return fetchInvezgoBlogList()
      .then((articles) => {
        const newArticles = articles.filter((a) => !sentUrls.has(a.url));
        if (newArticles.length === 0) return Promise.resolve();

        console.log(
          `[invezgoScheduler] ${newArticles.length} new article(s) found, sending to ${groupId}…`,
        );

        // Reverse so messages arrive oldest-first in the group feed
        const ordered = [...newArticles].reverse();

        // Send sequentially via promise chain (no await-in-loop)
        return ordered.reduce(
          (chain, article) => chain.then(() => sendArticle(article)),
          Promise.resolve(),
        );
      })
      .catch((err) => {
        console.error('[invezgoScheduler] Failed to fetch blog list:', err.message);
        // skip cycle, interval keeps running
      });
  }

  console.log(`[invezgoScheduler] Started. Interval: ${intervalMs}ms. Target group: ${groupId}`);

  // Initial check immediately on start
  checkAndSend();

  // Recurring interval
  setInterval(checkAndSend, intervalMs);
}

module.exports = { startInvezgoScheduler };
