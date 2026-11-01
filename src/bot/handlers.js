const { Niche, Prompt, sequelize } = require('../models');
const promptService = require('../services/promptService');
const pipelineService = require('../services/pipelineService');
const { fetchInvezgoBlogList } = require('../services/invezgoScraper');

/**
 * Escapes characters that Telegram's HTML parse_mode treats as markup.
 * Telegram HTML supports only: <b>, <i>, <u>, <s>, <code>, <pre>, <a>, <tg-spoiler>.
 * Any other `<` in content causes a 400 parse error.
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const DEFAULT_NICHE = process.env.ACTIVE_NICHE || 'finance';

/**
 * Authorization middleware.
 * Private chat: checks TELEGRAM_ALLOWED_USERS (if set).
 * Group/supergroup: checks TELEGRAM_ALLOWED_GROUPS (if set); member identity not required.
 * Channel: ignored.
 */
function authMiddleware(ctx, next) {
  const chatType = ctx.chat?.type;

  // Ignore channel posts
  if (chatType === 'channel') return;

  if (chatType === 'group' || chatType === 'supergroup') {
    const allowedGroups = process.env.TELEGRAM_ALLOWED_GROUPS;
    if (allowedGroups && allowedGroups.trim()) {
      const groupList = allowedGroups
        .split(',')
        .map((g) => g.trim().replace(/^@/, '').toLowerCase())
        .filter(Boolean);
      const chatId = String(ctx.chat?.id || '');
      const chatUsername = String(ctx.chat?.username || '').toLowerCase();
      const isAllowed = groupList.includes(chatId) || groupList.includes(chatUsername);
      if (!isAllowed) {
        return ctx.reply('⛔ Grup ini tidak diizinkan menggunakan bot ini.');
      }
    }
    return next();
  }

  // Private chat — original logic
  const allowed = process.env.TELEGRAM_ALLOWED_USERS;
  if (!allowed || !allowed.trim()) return next();

  const allowedList = allowed
    .split(',')
    .map((item) => item.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean);

  const userId = String(ctx.from?.id || '');
  const username = String(ctx.from?.username || '').toLowerCase();
  const isAllowed = allowedList.includes(userId) || allowedList.includes(username);

  if (!isAllowed) {
    return ctx.reply('⛔ Akses ditolak. Akun Telegram Anda tidak terdaftar sebagai pengguna resmi bot ini.');
  }

  return next();
}

/**
 * /start and /help command handler.
 */
async function handleStart(ctx) {
  const message = [
    '👋 <b>Selamat datang di Assistance Schedule Bot!</b>',
    '',
    'Bot ini mengotomasi posting berita pasar modal & finansial ke Instagram:',
    '• Ekstraksi entitas & headline editorial via AI',
    '• Generate poster feed 1080x1350 aesthetic Bloomberg / FT',
    '• Publikasi otomatis ke Instagram via Zernio API',
    '',
    '📌 <b>Cara Kirim Berita:</b>',
    '1. Kirim URL berita langsung (contoh: <code>https://invezgo.com/id/blog/...</code>)',
    '2. Atau teruskan (forward) pesan siaran berita berformat Invezgo yang memuat link artikel',
    '3. Tambahkan prefix <code>!dryrun</code> untuk simulasi tanpa posting ke Instagram',
    '',
    '👥 <b>Cara Pakai di Grup:</b>',
    '1. Tambahkan bot ke grup Telegram',
    '2. Kirim atau teruskan link/pesan siaran artikel Invezgo di grup',
    '3. Bot akan memproses otomatis dan mengirimkan notifikasi publikasi ke grup',
    '',
    '⚙️ <b>Perintah Manajemen Prompt:</b>',
    '/status — Cek status sistem & koneksi database',
    '/prompts — Daftar prompt aktif dan versinya',
    '/getprompt &lt;type&gt; — Tampilkan teks prompt tertentu',
    '/setprompt &lt;type&gt; &lt;teks&gt; — Perbarui prompt di database',
    '/resetprompt &lt;type&gt; — Kembalikan prompt ke versi default',
    '/newscheck — Cek artikel terbaru Invezgo',
  ].join('\n');

  return ctx.replyWithHTML(message);
}

/**
 * /status command handler.
 */
async function handleStatus(ctx) {
  try {
    await sequelize.authenticate();
    const niche = await Niche.findOne({ where: { code: DEFAULT_NICHE } });
    const promptsCount = niche ? await Prompt.count({ where: { nicheId: niche.id, isActive: true } }) : 0;
    const zernioConfigured = Boolean(process.env.ZERNIO_API_KEY);
    const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);

    const message = [
      '📊 <b>Status Sistem Assistance Schedule:</b>',
      '',
      `🏷️ <b>Active Niche:</b> <code>${escapeHtml(DEFAULT_NICHE)}</code> (${escapeHtml(niche?.name || 'Not Found')})`,
      `💾 <b>Database:</b> Terhubung (${sequelize.getDialect().toUpperCase()})`,
      `📝 <b>Prompt Aktif:</b> ${promptsCount} template`,
      `🤖 <b>OpenAI API:</b> ${openaiConfigured ? '✅ Terkonfigurasi' : '❌ Belum diisi'}`,
      `📸 <b>Zernio API:</b> ${zernioConfigured ? '✅ Terkonfigurasi' : '❌ Belum diisi'}`,
    ].join('\n');

    return ctx.replyWithHTML(message);
  } catch (err) {
    return ctx.reply(`❌ Gagal memeriksa status sistem: ${err.message}`);
  }
}

/**
 * /prompts command handler.
 */
async function handleListPrompts(ctx) {
  try {
    const prompts = await promptService.listPrompts(DEFAULT_NICHE);
    if (!prompts || prompts.length === 0) {
      return ctx.reply(`Belum ada prompt untuk niche "${DEFAULT_NICHE}".`);
    }

    const lines = [
      `📋 <b>Daftar Prompt untuk Niche: ${escapeHtml(DEFAULT_NICHE)}</b>`,
      '',
    ];

    prompts.forEach((p) => {
      lines.push(`• <b>${escapeHtml(p.type)}</b> (v${p.version})`);
      lines.push(`  Nama: ${escapeHtml(p.name)}`);
      lines.push('');
    });

    lines.push('Gunakan <code>/getprompt &lt;type&gt;</code> untuk membaca isi prompt.');

    return ctx.replyWithHTML(lines.join('\n'));
  } catch (err) {
    return ctx.reply(`Gagal memuat prompt: ${err.message}`);
  }
}

/**
 * /getprompt <type> command handler.
 */
async function handleGetPrompt(ctx) {
  const text = ctx.message?.text || '';
  const parts = text.split(/\s+/);
  const type = parts[1]?.trim();

  if (!type) {
    return ctx.reply('⚠️ Harap sertakan tipe prompt.\nContoh: /getprompt entity_extraction\n\nTipe yang tersedia: entity_extraction, visual_image, caption_template');
  }

  try {
    const promptRecord = await promptService.getActivePrompt(DEFAULT_NICHE, type);
    const replyText = [
      `📌 <b>Prompt: ${escapeHtml(promptRecord.type)} (v${promptRecord.version})</b>`,
      `<b>Nama:</b> ${escapeHtml(promptRecord.name)}`,
      '',
      '<b>System Prompt:</b>',
      `<code>${escapeHtml(promptRecord.systemPrompt.slice(0, 3000))}</code>`,
    ].join('\n');

    return ctx.replyWithHTML(replyText);
  } catch (err) {
    return ctx.reply(`❌ ${err.message}`);
  }
}

/**
 * /setprompt <type> <new_text> command handler.
 */
async function handleSetPrompt(ctx) {
  const text = ctx.message?.text || '';
  const match = text.match(/^\/setprompt\s+([a-zA-Z0-9_-]+)\s+([\s\S]+)$/);

  if (!match) {
    return ctx.reply('⚠️ Format salah.\nContoh: <code>/setprompt entity_extraction &lt;isi_system_prompt_baru&gt;</code>', { parse_mode: 'HTML' });
  }

  const type = match[1].trim();
  const newPrompt = match[2].trim();

  try {
    const updated = await promptService.updatePrompt(DEFAULT_NICHE, type, { systemPrompt: newPrompt });
    return ctx.replyWithHTML(`✅ <b>Prompt "${type}" berhasil diperbarui!</b>\nVersi saat ini: <b>v${updated.version}</b>`);
  } catch (err) {
    return ctx.reply(`❌ Gagal memperbarui prompt: ${err.message}`);
  }
}

/**
 * /resetprompt <type> command handler.
 */
async function handleResetPrompt(ctx) {
  const text = ctx.message?.text || '';
  const parts = text.split(/\s+/);
  const type = parts[1]?.trim();

  if (!type) {
    return ctx.reply('⚠️ Harap sertakan tipe prompt untuk di-reset.\nContoh: /resetprompt caption_template');
  }

  try {
    // In our architecture, re-updating with standard baseline increments version
    const defaultPrompts = {
      caption_template: '{{hook}}\n\n{{summary}}\n\n{{why_it_matters}}\n\n{{cta}}\n\n{{source}}\n\n{{hashtags}}\n\n{{disclaimer}}',
    };

    if (!defaultPrompts[type]) {
      return ctx.reply(`Reset otomatis belum tersedia untuk tipe "${type}". Gunakan /setprompt untuk mengubah isinya.`);
    }

    const updated = await promptService.updatePrompt(DEFAULT_NICHE, type, { systemPrompt: defaultPrompts[type] });
    return ctx.reply(`✅ Prompt "${type}" telah di-reset ke baseline (v${updated.version}).`);
  } catch (err) {
    return ctx.reply(`❌ Gagal me-reset prompt: ${err.message}`);
  }
}

/**
 * Cleans extracted URL candidate by trimming whitespace, surrounding brackets/quotes,
 * and trailing punctuation.
 *
 * @param {string} rawUrl
 * @returns {string|null}
 */
function cleanExtractedUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let url = rawUrl.trim();

  // Strip wrapping quotes or brackets: <url>, (url), [url], "url", 'url'
  url = url.replace(/^[<(['"]+/, '');

  // Strip trailing punctuation common in written text
  url = url.replace(/[.,;:!?'"]+$/, '');

  // Strip trailing closing brackets if unbalanced
  while (url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) {
    url = url.slice(0, -1);
  }
  while (url.endsWith(']') && (url.match(/\[/g) || []).length < (url.match(/\]/g) || []).length) {
    url = url.slice(0, -1);
  }
  while (url.endsWith('>') && (url.match(/</g) || []).length < (url.match(/>/g) || []).length) {
    url = url.slice(0, -1);
  }

  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * Extracts an article URL from a Telegram message using hierarchy:
 * 1. Telegram text_link entity (hyperlink attached to text)
 * 2. Telegram url entity (explicit URL detected by Telegram)
 * 3. Fallback regex search on message text or caption
 *
 * @param {object|string} message - Telegram message object or raw text string
 * @returns {string|null} - Extracted clean URL or null if not found
 */
function extractArticleUrl(message) {
  if (!message) return null;

  const msgObj = typeof message === 'string' ? { text: message } : message;
  const text = msgObj.text || msgObj.caption || '';
  let entities = [];
  if (Array.isArray(msgObj.entities)) {
    entities = msgObj.entities;
  } else if (Array.isArray(msgObj.caption_entities)) {
    entities = msgObj.caption_entities;
  }

  // 1. Check for text_link entities
  const textLinkEntity = entities.find((e) => e.type === 'text_link' && e.url && cleanExtractedUrl(e.url));
  if (textLinkEntity) {
    return cleanExtractedUrl(textLinkEntity.url);
  }

  // 2. Check for url entities
  const urlEntity = entities.find((e) => {
    if (e.type === 'url' && typeof e.offset === 'number' && typeof e.length === 'number') {
      const raw = text.slice(e.offset, e.offset + e.length);
      return Boolean(cleanExtractedUrl(raw));
    }
    return false;
  });
  if (urlEntity) {
    return cleanExtractedUrl(text.slice(urlEntity.offset, urlEntity.offset + urlEntity.length));
  }
  // 3. Fallback: regex search on text
  if (text) {
    const match = text.match(/https?:\/\/[^\s<>"'`]+/i);
    if (match) {
      const cleaned = cleanExtractedUrl(match[0]);
      if (cleaned) return cleaned;
    }
  }

  return null;
}

/**
 * Article submission handler for raw text or URL messages.
 */
async function handleArticleMessage(ctx) {
  const { message } = ctx;
  const rawText = (message?.text || message?.caption || '').trim();
  if (!rawText || rawText.startsWith('/')) {
    return;
  }

  // 1. Ekstrak modifier: !dryrun, --dry-run, !skip, --skip-publish
  const dryRun = /(^|\s)(!dryrun|--dry-run)(\s|$)/i.test(rawText);
  const skipPublish = /(^|\s)(!skip|--skip-publish)(\s|$)/i.test(rawText);

  // 2. Ekstrak URL via smart extraction
  const url = extractArticleUrl(message);

  // 3. Jika URL tidak ditemukan
  if (!url) {
    const chatType = ctx.chat?.type;
    const isPrivate = chatType === 'private';
    let entities = [];
    if (Array.isArray(message?.entities)) {
      entities = message.entities;
    } else if (Array.isArray(message?.caption_entities)) {
      entities = message.caption_entities;
    }
    const botUsername = ctx.botInfo?.username?.toLowerCase();
    const hasMention = entities.some((e) => {
      if (e.type === 'mention') {
        const mentionText = rawText.slice(e.offset, e.offset + e.length).toLowerCase();
        return !botUsername || mentionText === `@${botUsername}`;
      }
      return false;
    }) || (botUsername && rawText.toLowerCase().includes(`@${botUsername}`));
    const hasCommandPrefix = rawText.startsWith('!') || rawText.startsWith('--');

    if (isPrivate || hasCommandPrefix || hasMention) {
      const errorMsg = [
        '❌ <b>URL Berita Tidak Ditemukan</b>',
        '',
        'Harap kirimkan pesan yang memuat URL artikel yang valid.',
        'Contoh:',
        '• <code>https://invezgo.com/id/blog/judul-artikel</code>',
        '• Atau teruskan (forward) pesan berita yang memuat link artikel.',
        '',
        '<i>Tips: Tambahkan <code>!dryrun</code> untuk simulasi tanpa posting ke Instagram.</i>',
      ].join('\n');
      return ctx.replyWithHTML(errorMsg);
    }

    // Abaikan obrolan umum di grup tanpa URL/mention
    return;
  }
  const sender = ctx.from?.username ? `@${ctx.from.username}` : `telegram_user_${ctx.from?.id || 'anon'}`;
  const statusMsg = await ctx.reply('⏳ [1/4] Mengambil & memproses artikel...');

  const updateProgress = async (step, total, stepDesc) => {
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        null,
        `⏳ [${step}/${total}] ${stepDesc}`,
      );
    } catch (_) {
      // ignore telegram message edit error (e.g. content identical or throttled)
    }
  };

  try {
    const result = await pipelineService.runPipeline({
      nicheCode: DEFAULT_NICHE,
      input: { url },
      triggeredBy: sender,
      dryRun,
      skipPublish,
      onProgress: updateProgress,
    });

    const displayHeadline = result.extracted?.headline || result.article?.title || 'Market Update';
    const category = result.extracted?.category || 'IDX MARKET WATCH';

    let summaryText = '';
    if (dryRun) {
      summaryText = [
        '🔍 <b>[DRY-RUN SELESAI]</b>',
        `📰 <b>Headline:</b> ${escapeHtml(displayHeadline)}`,
        `🏷️ <b>Kategori:</b> #${escapeHtml(category)}`,
        `💾 <b>Database Log ID:</b> #${result.logId}`,
        '',
        '<i>Gambar dan publikasi dilewati karena mode dry-run.</i>',
      ].join('\n');
    } else if (skipPublish) {
      summaryText = [
        '🎨 <b>[GAMBAR SELESAI DIGENERATE]</b>',
        `📰 <b>Headline:</b> ${escapeHtml(displayHeadline)}`,
        `🏷️ <b>Kategori:</b> #${escapeHtml(category)}`,
        `💾 <b>Database Log ID:</b> #${result.logId}`,
        '',
        '<i>Publikasi ke Instagram dilewati.</i>',
      ].join('\n');
    } else {
      summaryText = [
        '✅ <b>Berhasil Dipublikasikan ke Instagram!</b>',
        `📌 <b>Post ID:</b> <code>${escapeHtml(result.publishResult?.postId || '-')}</code>`,
        `🔗 <b>URL:</b> ${escapeHtml(result.publishResult?.platformPostUrl || '(sedang diproses)')}`,
        `📰 <b>Headline:</b> ${escapeHtml(displayHeadline)}`,
        `🏷️ <b>Kategori:</b> #${escapeHtml(category)}`,
        `💾 <b>Database Log ID:</b> #${result.logId}`,
      ].join('\n');
    }

    await ctx.replyWithHTML(summaryText);
  } catch (err) {
    const errorMsg = [
      '❌ <b>Gagal Memproses Artikel:</b>',
      `<code>${escapeHtml(err.message)}</code>`,
    ].join('\n');
    await ctx.replyWithHTML(errorMsg);
  }
}

/**
 * /newscheck — manually trigger one Invezgo blog fetch and preview 5 latest articles.
 */
async function handleNewsCheck(ctx) {
  try {
    const articles = await fetchInvezgoBlogList();
    if (articles.length === 0) {
      return ctx.replyWithHTML('⚠️ Tidak ada artikel ditemukan. Struktur halaman mungkin berubah.');
    }
    const preview = articles.slice(0, 5).map((a, i) => (
      `${i + 1}. <a href="${escapeHtml(a.url)}">${escapeHtml(a.title)}</a>\n   🗓 ${escapeHtml(a.date)}`
    )).join('\n\n');
    return ctx.replyWithHTML(
      `📋 <b>5 Artikel Terbaru Invezgo:</b>\n\n${preview}\n\n<i>Total ditemukan: ${articles.length} artikel</i>`,
      { disable_web_page_preview: true },
    );
  } catch (err) {
    return ctx.replyWithHTML(`❌ <b>Gagal fetch blog Invezgo:</b>\n<code>${escapeHtml(err.message)}</code>`);
  }
}

module.exports = {
  authMiddleware,
  handleStart,
  handleStatus,
  handleListPrompts,
  handleGetPrompt,
  handleSetPrompt,
  handleResetPrompt,
  handleArticleMessage,
  handleNewsCheck,
  extractArticleUrl,
  cleanExtractedUrl,
};
