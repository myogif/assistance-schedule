/**
 * Invezgo Time-based Broadcast Scheduler
 *
 * Articles are fetched every INVEZGO_CHECK_INTERVAL_MS milliseconds and queued
 * in memory.
 *
 * Supported Modes:
 *   - 'instant' (default): Immediately broadcasts new articles to Telegram AND runs
 *     the full autopost pipeline (AI extract -> 1080x1350 poster -> Instagram publish)
 *     sequentially as soon as new articles are discovered.
 *   - 'slot': Queues articles in memory and executes at configured broadcast slots
 *     (default: 08:00, 10:00, 12:00, 14:00, 17:00 local server time).
 *
 * Required env:
 *   TELEGRAM_NEWS_GROUP_ID      — target group/channel ID (e.g. -1001234567890)
 *
 * Optional env:
 *   BROADCAST_MODE              — 'instant' (default) or 'slot'
 *   BROADCAST_PROCESS_ON_START  — in slot mode, process 1 article on start (default: true)
 *   BROADCAST_SCHEDULE_HOURS    — comma-separated 24h hours (default: 8,10,12,14,17)
 *   INVEZGO_CHECK_INTERVAL_MS   — polling interval in ms (default: 1800000 = 30 min)
 *   ACTIVE_NICHE                — niche code passed to pipeline (default: 'finance')
 */

const invezgoScraper = require('./invezgoScraper');
const pipelineService = require('./pipelineService');

let PostLog = null;
try {
  // eslint-disable-next-line global-require
  ({ PostLog } = require('../models'));
} catch (_) {
  // PostLog model optional during standalone unit tests
}

let isProcessingGlobal = false;

/**
 * Returns true if the broadcast pipeline is currently running.
 * @returns {boolean}
 */
function isBroadcastProcessing() {
  return isProcessingGlobal;
}

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

/**
 * Broadcasts an article to Telegram group and executes the full autopost pipeline
 * with live progress and status updates.
 *
 * @param {import('telegraf').Telegraf|object} bot - Telegraf instance or context with telegram API
 * @param {string|number} groupId - Target Telegram chat/group ID
 * @param {{ title?: string, url: string, date?: string, description?: string }} article
 * @param {string} [nicheCode='finance']
 * @param {object} [options={}]
 * @param {boolean} [options.dryRun=false]
 * @param {boolean} [options.skipPublish=false]
 * @param {string} [options.triggeredBy='broadcast_scheduler']
 * @returns {Promise<object>} Result of runPipeline
 */
async function processArticleWithFeedback(
  bot,
  groupId,
  article,
  nicheCode = 'finance',
  options = {},
) {
  const tg = bot?.telegram || bot;
  if (!groupId) {
    throw new Error('groupId is required for processArticleWithFeedback');
  }
  if (!article || !article.url) {
    throw new Error('Valid article with url is required for processArticleWithFeedback');
  }

  // 1. Send broadcast message with formatted Invezgo text with plain URL
  const broadcastText = buildArticleBroadcastMessage(article);
  await tg.sendMessage(groupId, broadcastText, {
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  });

  // 2. Send initial progress message
  let statusMsg = null;
  try {
    statusMsg = await tg.sendMessage(
      groupId,
      '⏳ [1/4] Mengambil & memproses artikel ke Instagram...',
    );
  } catch (err) {
    console.error('[broadcastScheduler] Failed to send initial progress message:', err.message);
  }

  // 3. Progress updater during pipeline execution
  const updateProgress = async (step, total, stepDesc) => {
    if (!statusMsg?.message_id) return;
    try {
      await tg.editMessageText(
        groupId,
        statusMsg.message_id,
        null,
        `⏳ [${step}/${total}] ${stepDesc}`,
      );
    } catch (_) {
      // Ignore edit errors (rate limits or content identical)
    }
  };

  try {
    // 4. Run full pipeline
    const result = await pipelineService.runPipeline({
      input: { url: article.url },
      nicheCode: nicheCode || 'finance',
      triggeredBy: options.triggeredBy || 'broadcast_scheduler',
      dryRun: Boolean(options.dryRun),
      skipPublish: Boolean(options.skipPublish),
      onProgress: updateProgress,
    });

    const displayHeadline = result?.extracted?.headline
      || result?.article?.title
      || article.title
      || 'Market Update';
    const igPostUrl = result?.publishResult?.platformPostUrl;
    const postId = result?.publishResult?.postId;

    let finalMsg = '';
    if (options.dryRun) {
      finalMsg = [
        '🔍 <b>[DRY-RUN SELESAI]</b>',
        `📰 <b>Headline:</b> ${escapeHtml(displayHeadline)}`,
        `💾 <b>Database Log ID:</b> #${result.logId}`,
        '',
        '<i>Gambar dan publikasi dilewati karena mode dry-run.</i>',
      ].join('\n');
    } else if (options.skipPublish) {
      finalMsg = [
        '🎨 <b>[GAMBAR SELESAI DIGENERATE]</b>',
        `📰 <b>Headline:</b> ${escapeHtml(displayHeadline)}`,
        `💾 <b>Database Log ID:</b> #${result.logId}`,
        '',
        '<i>Publikasi ke Instagram dilewati.</i>',
      ].join('\n');
    } else if (igPostUrl || result?.published) {
      const lines = ['✅ <b>Berhasil Dipublikasikan ke Instagram:</b>'];
      if (postId) {
        lines.push(`📌 <b>Post ID:</b> <code>${escapeHtml(postId)}</code>`);
      }
      if (igPostUrl) {
        lines.push(`🔗 <a href="${escapeHtml(igPostUrl)}">Lihat Post Instagram</a>`);
      }
      lines.push(`📰 <b>Headline:</b> ${escapeHtml(displayHeadline)}`);
      finalMsg = lines.join('\n');
    } else {
      finalMsg = [
        '✅ <b>Artikel Berhasil Diproses:</b>',
        `📰 <b>Headline:</b> ${escapeHtml(displayHeadline)}`,
        `📌 <b>Status:</b> ${escapeHtml(result.status || 'selesai')}`,
      ].join('\n');
    }

    if (statusMsg?.message_id) {
      try {
        await tg.editMessageText(groupId, statusMsg.message_id, null, finalMsg, {
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        });
      } catch (_) {
        await tg.sendMessage(groupId, finalMsg, {
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }).catch(() => {});
      }
    } else {
      await tg.sendMessage(groupId, finalMsg, {
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }).catch(() => {});
    }

    return result;
  } catch (err) {
    const errorMsg = [
      '❌ <b>Gagal Memproses Artikel ke Instagram:</b>',
      `<code>${escapeHtml(err.message)}</code>`,
    ].join('\n');

    if (statusMsg?.message_id) {
      try {
        await tg.editMessageText(groupId, statusMsg.message_id, null, errorMsg, {
          parse_mode: 'HTML',
        });
      } catch (_) {
        await tg.sendMessage(groupId, errorMsg, { parse_mode: 'HTML' }).catch(() => {});
      }
    } else {
      await tg.sendMessage(groupId, errorMsg, { parse_mode: 'HTML' }).catch(() => {});
    }

    throw err;
  }
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
    // All slots today have passed -> first slot tomorrow
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
 * Starts the broadcast scheduler.
 *
 * Modes:
 *   - 'instant' (default): Whenever new articles are polled, they are immediately
 *     processed sequentially through the autopost pipeline with group feedback.
 *   - 'slot': Articles are held in memory queue and processed one-by-one at
 *     scheduled hours. If BROADCAST_PROCESS_ON_START is true, the oldest article
 *     is processed immediately on startup if available.
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

  const broadcastMode = (process.env.BROADCAST_MODE || 'instant').trim().toLowerCase();
  const isInstantMode = broadcastMode === 'instant';
  const processOnStart = process.env.BROADCAST_PROCESS_ON_START !== 'false';

  // Parse schedule hours from env; fall back to defaults; sort ascending
  const rawHours = process.env.BROADCAST_SCHEDULE_HOURS || '';
  const scheduleHours = rawHours
    ? rawHours
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((h) => !Number.isNaN(h) && h >= 0 && h <= 23)
      .sort((a, b) => a - b)
    : [...DEFAULT_SCHEDULE_HOURS];

  if (!isInstantMode && scheduleHours.length === 0) {
    console.warn('[broadcastScheduler] BROADCAST_SCHEDULE_HOURS parsed to empty array, scheduler disabled.');
    return;
  }

  const intervalMs = parseInt(process.env.INVEZGO_CHECK_INTERVAL_MS, 10) || DEFAULT_INTERVAL_MS;
  const nicheCode = process.env.ACTIVE_NICHE || 'finance';

  /** @type {Set<string>} URLs already sent or queued this session */
  const sentUrls = new Set();

  /** @type {Array<{ title: string, url: string, date: string, description: string }>} Pending queue, oldest-first */
  const queue = [];

  let isFirstPoll = true;

  // ── Processing Runners ────────────────────────────────────────────────────────

  async function processQueue() {
    if (isProcessingGlobal || queue.length === 0) {
      return;
    }
    isProcessingGlobal = true;
    try {
      while (queue.length > 0) {
        const article = queue.shift();
        console.log(`[broadcastScheduler] [instant] Processing article: ${article.title?.slice(0, 60)}`);
        try {
          // eslint-disable-next-line no-await-in-loop
          await processArticleWithFeedback(bot, groupId, article, nicheCode);
          console.log(`[broadcastScheduler] [instant] Finished processing: ${article.title?.slice(0, 60)}`);
        } catch (err) {
          console.error(
            `[broadcastScheduler] [instant] Error processing "${article.title?.slice(0, 40)}":`,
            err.message,
          );
        }
      }
    } finally {
      isProcessingGlobal = false;
    }
  }

  async function processOneSlotArticle() {
    if (isProcessingGlobal || queue.length === 0) {
      return;
    }
    isProcessingGlobal = true;
    try {
      const article = queue.shift();
      console.log(`[broadcastScheduler] [slot] Processing article: ${article.title?.slice(0, 60)}`);
      await processArticleWithFeedback(bot, groupId, article, nicheCode);
      console.log(`[broadcastScheduler] [slot] Finished processing: ${article.title?.slice(0, 60)}`);
    } catch (err) {
      console.error(
        '[broadcastScheduler] [slot] Error processing:',
        err.message,
      );
    } finally {
      isProcessingGlobal = false;
    }
  }

  function scheduleNextSlot() {
    const msToNext = getNextSlotMs(scheduleHours);
    const label = _slotTimeLabel(msToNext);
    console.log(`[broadcastScheduler] Next slot at ${label} (in ${msToNext} ms)`);
    // eslint-disable-next-line no-use-before-define
    const slotTimer = setTimeout(onSlotFired, msToNext);
    if (slotTimer?.unref) slotTimer.unref();
  }

  async function onSlotFired() {
    if (queue.length === 0) {
      console.log('[broadcastScheduler] Slot fired — no queued articles, skipping.');
    } else if (isProcessingGlobal) {
      console.log('[broadcastScheduler] Slot fired — pipeline still running, skipping this slot.');
    } else {
      await processOneSlotArticle();
    }

    // Always schedule the next slot
    scheduleNextSlot();
  }

  // ── Article Poller ────────────────────────────────────────────────────────────

  async function pollArticles() {
    try {
      if (isFirstPoll && PostLog) {
        try {
          const existingLogs = await PostLog.findAll({
            attributes: ['articleUrl'],
            limit: 100,
            order: [['createdAt', 'DESC']],
          });
          for (let i = 0; i < existingLogs.length; i += 1) {
            const u = existingLogs[i]?.articleUrl;
            if (u) {
              sentUrls.add(u);
            }
          }
          if (sentUrls.size > 0) {
            console.log(
              `[broadcastScheduler] Seeded ${sentUrls.size} previously processed article URL(s) from database.`,
            );
          }
        } catch (dbErr) {
          console.warn('[broadcastScheduler] Could not seed sentUrls from PostLog:', dbErr.message);
        }
      }

      const articles = await invezgoScraper.fetchInvezgoBlogList();

      const newArticles = articles.filter(
        (a) => !sentUrls.has(a.url) && !queue.find((q) => q.url === a.url),
      );

      // Enqueue oldest first
      const reversed = newArticles.slice().reverse();
      for (let i = 0; i < reversed.length; i += 1) {
        const article = reversed[i];
        sentUrls.add(article.url);
        queue.push(article);
      }

      if (newArticles.length > 0) {
        console.log(
          `[broadcastScheduler] Queued ${newArticles.length} new article(s). Queue depth: ${queue.length}`,
        );
      }

      if (isInstantMode) {
        processQueue();
      } else if (isFirstPoll && processOnStart && queue.length > 0) {
        console.log('[broadcastScheduler] [slot] BROADCAST_PROCESS_ON_START triggered — processing 1 initial article immediately.');
        processOneSlotArticle();
      }
    } catch (err) {
      console.error('[broadcastScheduler] Failed to fetch blog list:', err.message);
    } finally {
      isFirstPoll = false;
    }

    const pollTimer = setTimeout(pollArticles, intervalMs);
    if (pollTimer?.unref) pollTimer.unref();
  }

  // ── Kick off ──────────────────────────────────────────────────────────────────

  console.log(
    `[broadcastScheduler] Started. Mode: ${isInstantMode ? 'instant' : 'slot'}. Slots: [${scheduleHours.join(',')}]. Target group: ${groupId}`,
  );

  pollArticles();
  if (!isInstantMode) {
    scheduleNextSlot();
  }
}

module.exports = {
  startBroadcastScheduler,
  processArticleWithFeedback,
  isBroadcastProcessing,
  getNextSlotMs,
  buildArticleBroadcastMessage,
  escapeHtml,
};
