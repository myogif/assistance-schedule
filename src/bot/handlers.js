const { Niche, Prompt, sequelize } = require('../models');
const promptService = require('../services/promptService');
const pipelineService = require('../services/pipelineService');

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
    '1. Kirim URL berita (contoh: <code>https://market.bisnis.com/...</code>)',
    '2. Atau kirim teks berita langsung ke chat ini',
    '',
    '👥 <b>Cara Pakai di Grup:</b>',
    '1. Tambahkan bot ke grup Telegram',
    '2. Kirim URL atau teks berita langsung di grup',
    '3. Bot akan proses dan balas notifikasi di grup yang sama',
    '',
    '⚙️ <b>Perintah Manajemen Prompt:</b>',
    '/status — Cek status sistem & koneksi database',
    '/prompts — Daftar prompt aktif dan versinya',
    '/getprompt &lt;type&gt; — Tampilkan teks prompt tertentu',
    '/setprompt &lt;type&gt; &lt;teks&gt; — Perbarui prompt di database',
    '/resetprompt &lt;type&gt; — Kembalikan prompt ke versi default',
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
 * Article submission handler for raw text or URL messages.
 */
async function handleArticleMessage(ctx) {
  const rawText = ctx.message?.text?.trim() || '';
  if (!rawText || rawText.startsWith('/')) {
    return;
  }

  let textToProcess = rawText;
  let dryRun = false;
  let skipPublish = false;

  if (textToProcess.startsWith('!dryrun') || textToProcess.startsWith('--dry-run')) {
    dryRun = true;
    textToProcess = textToProcess.replace(/^(!dryrun|--dry-run)\s*/i, '').trim();
  } else if (textToProcess.startsWith('!skip') || textToProcess.startsWith('--skip-publish')) {
    skipPublish = true;
    textToProcess = textToProcess.replace(/^(!skip|--skip-publish)\s*/i, '').trim();
  }

  if (!textToProcess) {
    return ctx.reply('⚠️ Masukkan URL atau teks artikel setelah perintah.');
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
      input: textToProcess,
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

module.exports = {
  authMiddleware,
  handleStart,
  handleStatus,
  handleListPrompts,
  handleGetPrompt,
  handleSetPrompt,
  handleResetPrompt,
  handleArticleMessage,
};
