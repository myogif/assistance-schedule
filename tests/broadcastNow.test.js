const test = require('node:test');
const assert = require('node:assert/strict');

const multiSourcePoller = require('../src/newsEngine/poller/MultiSourcePoller');
const broadcastScheduler = require('../src/services/broadcastScheduler');
const { handleBroadcastNow, handleNewsCheck } = require('../src/bot/handlers');

test('handleBroadcastNow warns if a broadcast is already processing', async () => {
  const origIsProcessing = broadcastScheduler.isBroadcastProcessing;
  broadcastScheduler.isBroadcastProcessing = () => true;

  const replies = [];
  const mockCtx = {
    chat: { id: 12345, type: 'private' },
    from: { id: 12345, username: 'tester' },
    replyWithHTML: async (text) => {
      replies.push(text);
      return { message_id: 1, text };
    },
  };

  await handleBroadcastNow(mockCtx);

  assert.equal(replies.length, 1);
  assert.match(replies[0], /Proses Sedang Berjalan/);

  broadcastScheduler.isBroadcastProcessing = origIsProcessing;
});

test('handleBroadcastNow handles empty article list', async () => {
  const origSync = multiSourcePoller.syncFeedsToQueue;
  const origGet = multiSourcePoller.getTopRankedArticles;

  multiSourcePoller.syncFeedsToQueue = async () => ({ discovered: 0, enqueued: 0, jobs: [] });
  multiSourcePoller.getTopRankedArticles = async () => [];

  const replies = [];
  const mockCtx = {
    chat: { id: 12345, type: 'private' },
    from: { id: 12345, username: 'tester' },
    replyWithHTML: async (text) => {
      replies.push(text);
      return { message_id: 1, text };
    },
  };

  await handleBroadcastNow(mockCtx);

  assert.equal(replies.length, 2);
  assert.match(replies[0], /Memulai broadcast/);
  assert.match(replies[1], /Tidak ada artikel ditemukan/);

  multiSourcePoller.syncFeedsToQueue = origSync;
  multiSourcePoller.getTopRankedArticles = origGet;
});

test('handleBroadcastNow executes processArticleWithFeedback and notifies private caller', async () => {
  const origSync = multiSourcePoller.syncFeedsToQueue;
  const origGet = multiSourcePoller.getTopRankedArticles;
  const origProcess = broadcastScheduler.processArticleWithFeedback;
  const origGroupId = process.env.TELEGRAM_NEWS_GROUP_ID;

  process.env.TELEGRAM_NEWS_GROUP_ID = '-1008888888888';

  const mockArticle = {
    title: 'Bank Mandiri Bukukan Laba Bersih Rekor',
    url: 'https://www.cnbcindonesia.com/market/20261115/bank-mandiri-rekor',
    date: '15 Nov 2026',
    sourceName: 'CNBC Indonesia',
    eventCategory: 'LAPORAN KEUANGAN',
    priorityScore: 0.92,
    stockTickers: ['BMRI'],
  };

  multiSourcePoller.syncFeedsToQueue = async () => ({ discovered: 1, enqueued: 1, jobs: [] });
  multiSourcePoller.getTopRankedArticles = async () => [mockArticle];

  let processedCall = null;
  broadcastScheduler.processArticleWithFeedback = async (bot, groupId, article, niche, opts) => {
    processedCall = {
      groupId,
      article,
      niche,
      opts,
    };
    return {
      logId: 777,
      published: true,
      extracted: { headline: 'Laba Rekor Bank Mandiri' },
      article: { title: 'Laba Rekor Bank Mandiri' },
      publishResult: { platformPostUrl: 'https://instagram.com/p/BMRI123' },
    };
  };

  const replies = [];
  const editedMessages = [];

  const mockCtx = {
    chat: { id: 12345, type: 'private' },
    from: { id: 12345, username: 'superuser' },
    replyWithHTML: async (text) => {
      replies.push(text);
      return { message_id: replies.length, text };
    },
    telegram: {
      editMessageText: async (chatId, messageId, inlineId, text) => {
        editedMessages.push({ chatId, messageId, text });
        return true;
      },
    },
  };

  await handleBroadcastNow(mockCtx);

  // 1. Started message
  assert.match(replies[0], /Memulai broadcast & auto-posting artikel terbaru/);

  // 2. Updated message showing target group and article
  assert.equal(editedMessages.length, 1);
  assert.match(editedMessages[0].text, /Target:<\/b> <code>-1008888888888<\/code>/);
  assert.match(editedMessages[0].text, /Bank Mandiri Bukukan Laba Bersih Rekor/);

  // 3. Processed article with feedback was called
  assert.ok(processedCall);
  assert.equal(processedCall.groupId, '-1008888888888');
  assert.equal(processedCall.article.url, mockArticle.url);
  assert.equal(processedCall.opts.triggeredBy, '@superuser');

  // 4. Final confirmation sent to caller in private chat
  assert.match(replies[1], /Broadcast & Autopost Selesai!/);
  assert.match(replies[1], /Headline:<\/b> Laba Rekor Bank Mandiri/);
  assert.match(replies[1], /https:\/\/instagram\.com\/p\/BMRI123/);

  // Restore
  multiSourcePoller.syncFeedsToQueue = origSync;
  multiSourcePoller.getTopRankedArticles = origGet;
  broadcastScheduler.processArticleWithFeedback = origProcess;
  process.env.TELEGRAM_NEWS_GROUP_ID = origGroupId || '';
});

test('handleNewsCheck outputs multi-source ranked leaderboard with scores and tickers', async () => {
  const origSync = multiSourcePoller.syncFeedsToQueue;
  const origGet = multiSourcePoller.getTopRankedArticles;

  multiSourcePoller.syncFeedsToQueue = async () => ({ discovered: 2, enqueued: 2, jobs: [] });
  multiSourcePoller.getTopRankedArticles = async () => [
    {
      title: 'BBCA Bagikan Dividen Tunai Terbesar',
      url: 'https://www.cnbcindonesia.com/market/bbca-dividen',
      sourceName: 'CNBC Indonesia',
      priorityScore: 0.95,
      stockTickers: ['BBCA'],
      date: '2 Jan 2025',
    },
    {
      title: 'Kinerja Emiten Tambang Menguat di Awal Tahun',
      url: 'https://insight.kontan.co.id/news/tambang-menguat',
      sourceName: 'Kontan',
      priorityScore: 0.85,
      stockTickers: ['ANTM', 'MDKA'],
      date: '2 Jan 2025',
    },
  ];

  const replies = [];
  const mockCtx = {
    chat: { id: 12345, type: 'private' },
    from: { id: 12345, username: 'tester' },
    replyWithHTML: async (text) => {
      replies.push(text);
      return { message_id: 1, text };
    },
  };

  await handleNewsCheck(mockCtx);

  assert.equal(replies.length, 1);
  assert.match(replies[0], /Top 5 Berita Finansial Teratas \(Multi-Source\)/);
  assert.match(replies[0], /1\. \[CNBC Indonesia\] ⭐ <b>0\.95\/1\.0<\/b>/);
  assert.match(replies[0], /BBCA Bagikan Dividen Tunai Terbesar/);
  assert.match(replies[0], /\[BBCA\]/);
  assert.match(replies[0], /2\. \[Kontan\] ⭐ <b>0\.85\/1\.0<\/b>/);
  assert.match(replies[0], /\[ANTM, MDKA\]/);

  multiSourcePoller.syncFeedsToQueue = origSync;
  multiSourcePoller.getTopRankedArticles = origGet;
});
