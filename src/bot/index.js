require('dotenv').config();
const { Telegraf } = require('telegraf');
const { BotConfig, Niche } = require('../models');
const {
  authMiddleware,
  handleStart,
  handleStatus,
  handleListPrompts,
  handleGetPrompt,
  handleSetPrompt,
  handleResetPrompt,
  handleArticleMessage,
  handleNewsCheck,
  handleBroadcastNow,
} = require('./handlers');
const { startBroadcastScheduler } = require('../services/broadcastScheduler');

const DEFAULT_NICHE = process.env.ACTIVE_NICHE || 'finance';

async function resolveBotToken() {
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim()) {
    return process.env.TELEGRAM_BOT_TOKEN.trim();
  }

  try {
    const niche = await Niche.findOne({ where: { code: DEFAULT_NICHE } });
    if (niche) {
      const config = await BotConfig.findOne({ where: { nicheId: niche.id, isActive: true } });
      if (config?.botToken) {
        return config.botToken;
      }
    }
  } catch (err) {
    console.warn('Could not query BotConfig from database:', err.message);
  }

  return null;
}

function registerHandlers(bot) {
  bot.use(authMiddleware);
  bot.command('start', handleStart);
  bot.command('help', handleStart);
  bot.command('status', handleStatus);
  bot.command('prompts', handleListPrompts);
  bot.command('getprompt', handleGetPrompt);
  bot.command('setprompt', handleSetPrompt);
  bot.command('resetprompt', handleResetPrompt);
  bot.command('newscheck', handleNewsCheck);
  bot.command('broadcastnow', handleBroadcastNow);
  bot.on('text', handleArticleMessage);
  bot.catch((err, ctx) => {
    console.error(`[BOT ERROR] chat=${ctx?.chat?.id} user=${ctx?.from?.id}:`, err.message);
    ctx?.reply('❌ Terjadi kesalahan internal. Silakan coba lagi.').catch(() => {});
  });
}

async function startBot() {
  const isTestMode = process.argv.includes('--test');

  const botToken = await resolveBotToken();

  if (isTestMode) {
    console.log('[BOT TEST MODE] Checking Telegram bot configuration and handlers...');
    const dummyBot = new Telegraf('123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
    registerHandlers(dummyBot);
    console.log('✅ Telegram bot handlers registered and validated successfully.');
    if (!botToken) {
      console.log('ℹ️ TELEGRAM_BOT_TOKEN is not set yet in .env (add your token to start the live bot).');
    } else {
      console.log('✅ TELEGRAM_BOT_TOKEN is present and configured.');
    }
    process.exit(0);
  }

  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN is not configured.');
    console.error('Silakan isi TELEGRAM_BOT_TOKEN di file .env atau tabel BotConfigs untuk menjalankan bot.');
    process.exit(1);
  }

  const bot = new Telegraf(botToken, { handlerTimeout: Infinity });
  registerHandlers(bot);

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  console.log(`🤖 Assistance Schedule Telegram Bot is starting for niche "${DEFAULT_NICHE}"...`);
  await bot.launch();
  console.log('🚀 Telegram bot is actively polling for messages!');

  startBroadcastScheduler(bot);
}

if (require.main === module) {
  startBot().catch((err) => {
    console.error('Fatal error starting Telegram bot:', err);
    process.exit(1);
  });
}

module.exports = {
  resolveBotToken,
  registerHandlers,
  startBot,
};
