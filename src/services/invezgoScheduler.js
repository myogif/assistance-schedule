/**
 * Invezgo Blog Auto-Broadcast Scheduler
 *
 * Polls https://invezgo.com/id/blog every INVEZGO_CHECK_INTERVAL_MS milliseconds
 * (default 30 minutes). For each new article:
 *   1. Sends the article URL (plain text) to the configured Telegram group.
 *   2. Runs the full pipeline (AI extract → image generation → Instagram publish).
 *   3. While processing, skips subsequent check cycles (lock-protected).
 *
 * Required env:
 *   TELEGRAM_NEWS_GROUP_ID  — target group/channel ID (e.g. -1001234567890)
 *
 * Optional env:
 *   INVEZGO_CHECK_INTERVAL_MS — polling interval in ms (default: 1800000 = 30 min)
 */

const { fetchInvezgoBlogList } = require('./invezgoScraper');
const { runPipeline } = require('./pipelineService');

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Starts the Invezgo blog polling scheduler.
 *
 * Uses an in-memory Set for URL deduplication — on process restart, at most
 * one batch of previously-seen articles may be re-processed.
 *
 * Uses a module-level `isProcessing` flag so check cycles are fully skipped
 * while a pipeline run is still in progress.
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
  const nicheCode = process.env.ACTIVE_NICHE || 'finance';

  /** @type {Set<string>} URLs already processed this session */
  const sentUrls = new Set();

  /** Lock: true while any pipeline is running — check cycles are skipped */
  let isProcessing = false;

  /**
   * Sends URL to group, runs the full pipeline, marks URL as done.
   * Never rejects — errors are logged.
   * @param {{ title: string, url: string, date: string }} article
   * @returns {Promise<void>}
   */
  function processArticle(article) {
    // Mark immediately so concurrent/overlapping cycles never double-queue
    sentUrls.add(article.url);
    isProcessing = true;

    console.log(`[invezgoScheduler] Processing: ${article.title.slice(0, 60)}`);

    // Step 1: notify group with plain URL
    return bot.telegram
      .sendMessage(groupId, article.url)
      .catch((err) => {
        console.error('[invezgoScheduler] Failed to send URL to group:', err.message);
      })
      // Step 2: run full pipeline (AI extract → image → Instagram publish)
      .then(() => runPipeline({
        input: { url: article.url },
        nicheCode,
        triggeredBy: 'invezgo_scheduler',
      }))
      .then((result) => {
        console.log(
          `[invezgoScheduler] Done: ${article.title.slice(0, 50)} | status: ${result.status}`,
        );
      })
      .catch((err) => {
        console.error(`[invezgoScheduler] Pipeline failed for "${article.title.slice(0, 40)}":`, err.message);
      })
      .then(() => {
        isProcessing = false;
      });
  }

  function checkAndSend() {
    // Skip cycle entirely if a pipeline is still running
    if (isProcessing) {
      console.log('[invezgoScheduler] Still processing previous article, skipping cycle.');
      return Promise.resolve();
    }

    return fetchInvezgoBlogList()
      .then((articles) => {
        const newArticles = articles.filter((a) => !sentUrls.has(a.url));

        if (newArticles.length === 0) return Promise.resolve();

        console.log(`[invezgoScheduler] ${newArticles.length} new article(s) found.`);

        // Process oldest-first, one at a time sequentially
        const ordered = [...newArticles].reverse();

        // Chain processArticle calls so each waits for the previous to finish
        return ordered.reduce(
          (chain, article) => chain.then(() => (isProcessing ? Promise.resolve() : processArticle(article))),
          Promise.resolve(),
        );
      })
      .catch((err) => {
        console.error('[invezgoScheduler] Failed to fetch blog list:', err.message);
      });
  }

  console.log(`[invezgoScheduler] Started. Interval: ${intervalMs}ms. Target group: ${groupId}`);

  // Initial check immediately on start
  checkAndSend();

  // Recurring interval
  setInterval(checkAndSend, intervalMs);
}

module.exports = { startInvezgoScheduler };
