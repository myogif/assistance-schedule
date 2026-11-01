/**
 * Invezgo Time-based Broadcast Scheduler
 *
 * Articles are fetched every INVEZGO_CHECK_INTERVAL_MS milliseconds and queued
 * in memory. Actual Telegram delivery + pipeline execution happens only at the
 * configured broadcast slots (default: 08:00, 10:00, 12:00, 14:00, 17:00 local
 * server time). One article (oldest first) is processed per slot.
 *
 * Required env:
 *   TELEGRAM_NEWS_GROUP_ID      — target group/channel ID (e.g. -1001234567890)
 *
 * Optional env:
 *   BROADCAST_SCHEDULE_HOURS    — comma-separated 24h hours (default: 8,10,12,14,17)
 *   INVEZGO_CHECK_INTERVAL_MS   — polling interval in ms (default: 1800000 = 30 min)
 *   ACTIVE_NICHE                — niche code passed to pipeline (default: 'finance')
 *
 * Note on timezone: uses new Date().getHours() (local OS time). If the server runs
 * UTC but WIB (UTC+7) is required, set TZ=Asia/Jakarta in the environment before
 * starting the process.
 */

'use strict';

const { fetchInvezgoBlogList } = require('./invezgoScraper');
const { runPipeline } = require('./pipelineService');

/**
 * Escapes special HTML characters (&, <, >) to prevent Telegram HTML parse errors.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Builds a formatted broadcast message for Telegram with a plain, explicit URL.
 *
 * @param {{ title?: string, url: string, date?: string, description?: string }} article
 * @returns {string}
 */
function buildArticleBroadcastMessage(article) {
  if (!article) return '';
  const lines = ['📰 <b>INVEZGO — Artikel Baru</b>', ''];

  if (article.title) {
    lines.push(`<b>${escapeHtml(article.title)}</b>`);
  }
  if (article.description) {
    lines.push(`<i>${escapeHtml(article.description)}</i>`);
  }
  if (article.date) {
    lines.push(`🗓 ${escapeHtml(article.date)}`);
  }

  lines.push('');
  lines.push(`🔗 ${article.url || ''}`);

  return lines.join('\n');
}

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_SCHEDULE_HOURS = [8, 10, 12, 14, 17];

/**
 * Calculates milliseconds until the next broadcast slot.
 *
 * Rules:
 *   - A slot at the current hour is considered "now" only if we are at exactly
 *     00m 00s (within the first 500 ms); otherwise it is treated as already past.
 *   - If all today's slots have passed, returns ms to the first slot tomorrow.
 *
 * @param {number[]} scheduleHours  Sorted ascending array of 24h integers.
 * @returns {number} Milliseconds to next slot (always > 0).
 */
function getNextSlotMs(scheduleHours) {
  const now = new Date();
  const nowH = now.getHours();
  const nowM = now.getMinutes();
  const nowS = now.getSeconds();
  const nowMs = now.getMilliseconds();

  // Find the earliest slot still in the future today
  const todaySlot = scheduleHours.find(
    (h) => h > nowH || (h === nowH && nowM === 0 && nowS === 0 && nowMs < 500),
  );

  let target;
  if (todaySlot !== undefined) {
    target = new Date(now);
    target.setHours(todaySlot, 0, 0, 0);
  } else {
    // All slots today have passed → first slot tomorrow
    target = new Date(now);
    target.setDate(target.getDate() + 1);
    target.setHours(scheduleHours[0], 0, 0, 0);
  }

  return target - now; // ms
}

/**
 * Formats a future Date as a "HH:MM:SS" string for log readability.
 * @param {number} msFromNow
 * @returns {string}
 */
function _slotTimeLabel(msFromNow) {
  const t = new Date(Date.now() + msFromNow);
  return t.toTimeString().slice(0, 8); // "HH:MM:SS"
}

/**
 * Starts the time-based broadcast scheduler.
 *
 * Two independent loops run concurrently:
 *   1. pollArticles — fetches the Invezgo blog list on a fixed interval and
 *      pushes unseen articles onto the in-memory queue.
 *   2. scheduleNextSlot / onSlotFired — counts down to the next broadcast hour,
 *      then pops one article from the queue and processes it.
 *
 * @param {import('telegraf').Telegraf} bot  Live Telegraf instance with a valid token.
 */
function startBroadcastScheduler(bot) {
  const groupId = process.env.TELEGRAM_NEWS_GROUP_ID
    ? process.env.TELEGRAM_NEWS_GROUP_ID.trim()
    : '';

  if (!groupId) {
    console.warn('[broadcastScheduler] TELEGRAM_NEWS_GROUP_ID not set, scheduler disabled.');
    return;
  }

  // Parse schedule hours from env; fall back to defaults; sort ascending
  const rawHours = process.env.BROADCAST_SCHEDULE_HOURS || '';
  const scheduleHours = rawHours
    ? rawHours
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((h) => !isNaN(h) && h >= 0 && h <= 23)
        .sort((a, b) => a - b)
    : [...DEFAULT_SCHEDULE_HOURS];

  if (scheduleHours.length === 0) {
    console.warn('[broadcastScheduler] BROADCAST_SCHEDULE_HOURS parsed to empty array, scheduler disabled.');
    return;
  }

  const intervalMs = parseInt(process.env.INVEZGO_CHECK_INTERVAL_MS, 10) || DEFAULT_INTERVAL_MS;
  const nicheCode = process.env.ACTIVE_NICHE || 'finance';

  /** @type {Set<string>} URLs already sent or queued this session */
  const sentUrls = new Set();

  /** @type {Array<{ title: string, url: string, date: string }>} Pending queue, oldest-first */
  const queue = [];

  /** True while a pipeline run is in flight — prevents concurrent processing */
  let isProcessing = false;

  // ── Slot scheduler ───────────────────────────────────────────────────────────

  function scheduleNextSlot() {
    const msToNext = getNextSlotMs(scheduleHours);
    const label = _slotTimeLabel(msToNext);
    console.log(`[broadcastScheduler] Next slot at ${label} (in ${msToNext} ms)`);
    setTimeout(onSlotFired, msToNext);
  }

  async function onSlotFired() {
    if (queue.length === 0) {
      console.log('[broadcastScheduler] Slot fired — no queued articles, skipping.');
    } else if (isProcessing) {
      console.log('[broadcastScheduler] Slot fired — pipeline still running, skipping this slot.');
    } else {
      const article = queue.shift(); // oldest first
      console.log(`[broadcastScheduler] Slot fired — processing: ${article.title.slice(0, 60)}`);
      isProcessing = true;

      try {
        // Step 1: notify group with formatted broadcast message including plain URL
        const broadcastText = buildArticleBroadcastMessage(article);
        await bot.telegram.sendMessage(groupId, broadcastText, {
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }).catch((err) => {
          console.error('[broadcastScheduler] Failed to send broadcast message to group:', err.message);
        });

        // Step 2: run full pipeline (AI extract → image → Instagram publish)
        const result = await runPipeline({
          input: { url: article.url },
          nicheCode,
          triggeredBy: 'broadcast_scheduler',
        });

        console.log(
          `[broadcastScheduler] Done: ${article.title.slice(0, 50)} | status: ${result.status}`,
        );

        // Step 3: notify group if successfully published to Instagram
        if (result?.publishResult?.platformPostUrl) {
          const igNotification = [
            '✅ <b>Berhasil Dipublikasikan ke Instagram:</b>',
            `🔗 <a href="${escapeHtml(result.publishResult.platformPostUrl)}">Lihat Post Instagram</a>`,
          ].join('\n');
          await bot.telegram.sendMessage(groupId, igNotification, {
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          }).catch((err) => {
            console.error('[broadcastScheduler] Failed to send Instagram notification to group:', err.message);
          });
        }
      } catch (err) {
        console.error(
          `[broadcastScheduler] Pipeline failed for "${article.title.slice(0, 40)}":`,
          err.message,
        );
      } finally {
        isProcessing = false;
      }
    }

    // Always schedule the next slot, regardless of outcome
    scheduleNextSlot();
  }

  // ── Article poller ────────────────────────────────────────────────────────────

  async function pollArticles() {
    try {
      const articles = await fetchInvezgoBlogList();

      const newArticles = articles.filter(
        (a) => !sentUrls.has(a.url) && !queue.find((q) => q.url === a.url),
      );

      for (const article of newArticles) {
        sentUrls.add(article.url);
        queue.push(article);
      }

      if (newArticles.length > 0) {
        console.log(
          `[broadcastScheduler] Queued ${newArticles.length} new article(s). Queue depth: ${queue.length}`,
        );
      }
    } catch (err) {
      console.error('[broadcastScheduler] Failed to fetch blog list:', err.message);
      // Non-fatal: next poll will retry
    }

    setTimeout(pollArticles, intervalMs);
  }

  // ── Kick off ──────────────────────────────────────────────────────────────────

  console.log(
    `[broadcastScheduler] Started. Slots: [${scheduleHours.join(',')}]. Target group: ${groupId}`,
  );

  pollArticles();      // begin fetching immediately
  scheduleNextSlot(); // arm the first broadcast slot
}

module.exports = {
  startBroadcastScheduler,
  getNextSlotMs,
  buildArticleBroadcastMessage,
  escapeHtml,
};
