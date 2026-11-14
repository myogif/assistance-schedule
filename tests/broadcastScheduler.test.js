/* eslint-disable object-curly-newline */
process.env.NODE_ENV = 'test';
process.env.BROADCAST_INSTANT_DELAY_MS = '0';
const test = require('node:test');
const assert = require('node:assert/strict');

// Mock pipelineService and multiSourcePoller before requiring broadcastScheduler
const pipelineService = require('../src/services/pipelineService');
const multiSourcePoller = require('../src/newsEngine/poller/MultiSourcePoller');

const originalRunPipeline = pipelineService.runPipeline;
const originalSyncFeedsToQueue = multiSourcePoller.syncFeedsToQueue;
const originalGetTopRankedArticles = multiSourcePoller.getTopRankedArticles;

const {
  processArticleWithFeedback,
  buildArticleBroadcastMessage,
  escapeHtml,
  getNextSlotMs,
  startBroadcastScheduler,
} = require('../src/services/broadcastScheduler');

test('escapeHtml properly escapes HTML special characters', () => {
  assert.equal(escapeHtml('A & B < C > D'), 'A &amp; B &lt; C &gt; D');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.ok(getNextSlotMs([8, 10, 12, 14, 17]) > 0);
});

test('buildArticleBroadcastMessage formats dynamic institutional source header, tickers, and URL', () => {
  // 1. Dynamic multi-source article with category and tickers
  const articleA = {
    title: 'BBCA Tebar Dividen Final Jumbo Rp 250 Per Saham',
    description: 'Manajemen BCA menyetujui pembagian dividen final.',
    executiveSummary: 'BCA membagikan total dividen jumbo tahun buku 2024.',
    date: '10 Nov 2026',
    url: 'https://www.cnbcindonesia.com/market/20261110/bbca-dividen',
    sourceName: 'CNBC Indonesia',
    eventCategory: 'DIVIDEN',
    stockTickers: ['BBCA', 'BMRI'],
  };

  const messageA = buildArticleBroadcastMessage(articleA);
  assert.match(messageA, /📰 <b>CNBC INDONESIA — DIVIDEN<\/b>/);
  assert.match(messageA, /<b>BBCA Tebar Dividen Final Jumbo Rp 250 Per Saham<\/b>/);
  assert.match(messageA, /<i>BCA membagikan total dividen jumbo tahun buku 2024\.<\/i>/);
  assert.match(messageA, /🗓 10 Nov 2026/);
  assert.match(messageA, /🏷️ #BBCA #BMRI/);
  assert.match(messageA, /🔗 https:\/\/www\.cnbcindonesia\.com\/market\/20261110\/bbca-dividen/);

  // 2. Articles without ranking metadata still receive a universal header
  const articleB = {
    title: 'Saham BBCA & BBRI Melonjak <Hari Ini>',
    description: 'Analisis pergerakan saham perbankan',
    date: '10 Nov 2026',
    url: 'https://example.com/market/saham-bbca-bbri',
  };

  const messageB = buildArticleBroadcastMessage(articleB);
  assert.match(messageB, /📰 <b>EXAMPLE\.COM — UPDATE PASAR<\/b>/);
  assert.match(messageB, /<b>Saham BBCA &amp; BBRI Melonjak &lt;Hari Ini&gt;<\/b>/);
  assert.match(messageB, /<i>Analisis pergerakan saham perbankan<\/i>/);
  assert.match(messageB, /🗓 10 Nov 2026/);
  assert.match(messageB, /🔗 https:\/\/example\.com\/market\/saham-bbca-bbri/);
});

test('processArticleWithFeedback successfully broadcasts and updates Instagram post info', async () => {
  const sentMessages = [];
  const editedMessages = [];

  const mockBot = {
    telegram: {
      sendMessage: async (chatId, text, extra) => {
        const msg = {
          message_id: sentMessages.length + 1,
          chatId,
          text,
          extra,
        };
        sentMessages.push(msg);
        return msg;
      },
      editMessageText: async (chatId, messageId, inlineMessageId, text, extra) => {
        const edit = {
          chatId,
          messageId,
          inlineMessageId,
          text,
          extra,
        };
        editedMessages.push(edit);
        return edit;
      },
    },
  };

  let pipelineCalledWith = null;
  pipelineService.runPipeline = async (params) => {
    pipelineCalledWith = params;
    // Simulate step progress callbacks
    if (params.onProgress) {
      await params.onProgress(2, 4, 'Menganalisis artikel dengan AI...');
      await params.onProgress(3, 4, 'Men-generate visual postingan...');
      await params.onProgress(4, 4, 'Mempublikasikan ke Instagram...');
    }
    return {
      logId: 1234,
      published: true,
      article: { title: 'Laba Rekor Bank Mandiri' },
      extracted: { headline: 'Laba Bersih BMRI Melonjak 30%' },
      image: { outputPath: '/tmp/generated-poster.png' },
      publishResult: {
        platformPostUrl: 'https://instagram.com/p/Cxyz123',
        containerId: 'ig_123',
      },
    };
  };

  const article = {
    title: 'Bank Mandiri Catat Pertumbuhan Laba Bersih Tertinggi',
    description: 'Kinerja gemilang sektor perbankan pelat merah',
    date: '10 Nov 2026',
    url: 'https://insight.kontan.co.id/news/bank-mandiri-laba-bersih-rekor',
    sourceName: 'Kontan',
    eventCategory: 'LAPORAN KEUANGAN',
    stockTickers: ['BMRI'],
  };

  const result = await processArticleWithFeedback(
    mockBot,
    '-1001234567890',
    article,
    'finance',
    { triggeredBy: 'test_runner' },
  );

  // 1. Initial broadcast message was sent with formatted Kontan text
  assert.equal(sentMessages.length, 2);
  assert.match(sentMessages[0].text, /📰 <b>KONTAN — LAPORAN KEUANGAN<\/b>/);
  assert.match(sentMessages[0].text, /🔗 https:\/\/insight\.kontan\.co\.id\/news\/bank-mandiri-laba-bersih-rekor/);
  assert.match(sentMessages[0].text, /🏷️ #BMRI/);

  // 2. Initial progress message was sent
  assert.match(sentMessages[1].text, /\[1\/4\]/);

  // 3. Pipeline service was invoked with correct arguments
  assert.ok(pipelineCalledWith);
  assert.equal(pipelineCalledWith.input.url, article.url);
  assert.equal(pipelineCalledWith.nicheCode, 'finance');
  assert.equal(pipelineCalledWith.triggeredBy, 'test_runner');

  // 4. Progress was updated sequentially
  assert.ok(editedMessages.length >= 4);
  assert.match(editedMessages[0].text, /\[2\/4\]/);
  assert.match(editedMessages[1].text, /\[3\/4\]/);
  assert.match(editedMessages[2].text, /\[4\/4\]/);

  // 5. Final message shows completion with Instagram link
  const finalEdit = editedMessages[editedMessages.length - 1];
  assert.match(finalEdit.text, /✅ <b>Berhasil Dipublikasikan ke Instagram:<\/b>/);
  assert.match(finalEdit.text, /https:\/\/instagram\.com\/p\/Cxyz123/);
  assert.match(finalEdit.text, /Laba Bersih BMRI Melonjak 30%/);

  assert.equal(result.published, true);
  assert.equal(result.logId, 1234);

  // Restore mock
  pipelineService.runPipeline = originalRunPipeline;
});

test('processArticleWithFeedback edits message to error when pipeline fails', async () => {
  const sentMessages = [];
  const editedMessages = [];

  const mockBot = {
    telegram: {
      sendMessage: async (chatId, text, extra) => {
        const msg = { message_id: sentMessages.length + 1, chatId, text, extra };
        sentMessages.push(msg);
        return msg;
      },
      editMessageText: async (chatId, messageId, inlineMessageId, text, extra) => {
        const edit = { chatId, messageId, inlineMessageId, text, extra };
        editedMessages.push(edit);
        return edit;
      },
    },
  };

  pipelineService.runPipeline = async () => {
    throw new Error('OpenAI quota exceeded');
  };

  const article = {
    title: 'IHSG Menguat Tipis di Awal Sesi',
    url: 'https://www.antaranews.com/berita/ihsg-menguat-awal-sesi',
    sourceName: 'Antara',
  };

  await assert.rejects(
    async () => {
      await processArticleWithFeedback(mockBot, '-1001234567890', article);
    },
    /OpenAI quota exceeded/,
  );

  assert.ok(editedMessages.length >= 1);
  const lastEdit = editedMessages[editedMessages.length - 1];
  assert.match(lastEdit.text, /❌ <b>Gagal Memproses Artikel ke Instagram:<\/b>/);
  assert.match(lastEdit.text, /OpenAI quota exceeded/);

  pipelineService.runPipeline = originalRunPipeline;
});

test('startBroadcastScheduler processes queue immediately in instant mode with catchup enabled', async () => {
  const prevGroupId = process.env.TELEGRAM_NEWS_GROUP_ID;
  const prevMode = process.env.BROADCAST_MODE;
  const prevInterval = process.env.NEWS_POLL_INTERVAL_MS;
  const prevCatchup = process.env.BROADCAST_CATCHUP;

  process.env.TELEGRAM_NEWS_GROUP_ID = '-1009999999999';
  process.env.BROADCAST_MODE = 'instant';
  process.env.NEWS_POLL_INTERVAL_MS = '9999999';
  process.env.BROADCAST_CATCHUP = 'true';

  let pipelineCallCount = 0;
  const processedUrls = [];

  pipelineService.runPipeline = async (params) => {
    pipelineCallCount += 1;
    processedUrls.push(params.input.url);
    return {
      logId: 99,
      published: true,
      publishResult: { platformPostUrl: 'https://instagram.com/p/test' },
    };
  };

  multiSourcePoller.syncFeedsToQueue = async () => ({ discovered: 2, enqueued: 2, jobs: [] });
  multiSourcePoller.getTopRankedArticles = async () => [
    { title: 'Rank 1 Article', url: 'https://www.cnbcindonesia.com/market/article-1', date: '2 Nov', priorityScore: 0.9 },
    { title: 'Rank 2 Article', url: 'https://insight.kontan.co.id/news/article-2', date: '1 Nov', priorityScore: 0.8 },
  ];

  const mockBot = {
    telegram: {
      sendMessage: async (chatId, text) => ({ message_id: 1, text }),
      editMessageText: async () => true,
    },
  };

  startBroadcastScheduler(mockBot);

  // Allow async tasks to run
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

  assert.equal(pipelineCallCount, 2);
  // Ranked first: Rank 1 is processed first, then Rank 2
  assert.equal(processedUrls[0], 'https://www.cnbcindonesia.com/market/article-1');
  assert.equal(processedUrls[1], 'https://insight.kontan.co.id/news/article-2');

  // Restore env
  process.env.TELEGRAM_NEWS_GROUP_ID = prevGroupId || '';
  process.env.BROADCAST_MODE = prevMode || '';
  process.env.NEWS_POLL_INTERVAL_MS = prevInterval || '';
  process.env.BROADCAST_CATCHUP = prevCatchup || '';

  pipelineService.runPipeline = originalRunPipeline;
  multiSourcePoller.syncFeedsToQueue = originalSyncFeedsToQueue;
  multiSourcePoller.getTopRankedArticles = originalGetTopRankedArticles;
});

test('startBroadcastScheduler in slot mode processes 1 article on start when BROADCAST_PROCESS_ON_START=true', async () => {
  const prevGroupId = process.env.TELEGRAM_NEWS_GROUP_ID;
  const prevMode = process.env.BROADCAST_MODE;
  const prevOnStart = process.env.BROADCAST_PROCESS_ON_START;
  const prevInterval = process.env.NEWS_POLL_INTERVAL_MS;

  process.env.TELEGRAM_NEWS_GROUP_ID = '-1009999999999';
  process.env.BROADCAST_MODE = 'slot';
  process.env.BROADCAST_PROCESS_ON_START = 'true';
  process.env.NEWS_POLL_INTERVAL_MS = '9999999';

  let pipelineCallCount = 0;
  const processedUrls = [];

  pipelineService.runPipeline = async (params) => {
    pipelineCallCount += 1;
    processedUrls.push(params.input.url);
    return {
      logId: 101,
      published: true,
      publishResult: { platformPostUrl: 'https://instagram.com/p/slot-test' },
    };
  };

  multiSourcePoller.syncFeedsToQueue = async () => ({ discovered: 2, enqueued: 2, jobs: [] });
  multiSourcePoller.getTopRankedArticles = async () => [
    { title: 'Top Ranked Article', url: 'https://www.cnbcindonesia.com/market/slot-newest', date: '3 Nov', priorityScore: 0.95 },
    { title: 'Lower Ranked Article', url: 'https://rss.tempo.co/slot-oldest', date: '1 Nov', priorityScore: 0.70 },
  ];

  const mockBot = {
    telegram: {
      sendMessage: async (chatId, text) => ({ message_id: 1, text }),
      editMessageText: async () => true,
    },
  };

  startBroadcastScheduler(mockBot);

  // Allow async tasks to run
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

  // Exactly 1 article processed on start (top ranked article under cold-start baseline seeding)
  assert.equal(pipelineCallCount, 1);
  assert.equal(processedUrls[0], 'https://www.cnbcindonesia.com/market/slot-newest');

  // Restore env
  process.env.TELEGRAM_NEWS_GROUP_ID = prevGroupId || '';
  process.env.BROADCAST_MODE = prevMode || '';
  process.env.BROADCAST_PROCESS_ON_START = prevOnStart || '';
  process.env.NEWS_POLL_INTERVAL_MS = prevInterval || '';

  pipelineService.runPipeline = originalRunPipeline;
  multiSourcePoller.syncFeedsToQueue = originalSyncFeedsToQueue;
  multiSourcePoller.getTopRankedArticles = originalGetTopRankedArticles;
});

test('startBroadcastScheduler cold-start smoke test with 20 articles only executes 1 newest article', async () => {
  const prevGroupId = process.env.TELEGRAM_NEWS_GROUP_ID;
  const prevMode = process.env.BROADCAST_MODE;
  const prevInterval = process.env.NEWS_POLL_INTERVAL_MS;
  const prevCatchup = process.env.BROADCAST_CATCHUP;

  process.env.TELEGRAM_NEWS_GROUP_ID = '-1009999999999';
  process.env.BROADCAST_MODE = 'instant';
  process.env.NEWS_POLL_INTERVAL_MS = '9999999';
  process.env.BROADCAST_CATCHUP = 'false';

  let pipelineCallCount = 0;
  const processedUrls = [];

  pipelineService.runPipeline = async (params) => {
    pipelineCallCount += 1;
    processedUrls.push(params.input.url);
    return {
      logId: 200,
      published: true,
      publishResult: { platformPostUrl: 'https://instagram.com/p/cold-start' },
    };
  };

  // Generate 20 mock articles (highest rank at index 0)
  const mock20Articles = Array.from({ length: 20 }, (_, i) => ({
    title: `Mock Article ${i + 1}`,
    url: `https://www.cnbcindonesia.com/market/mock-article-${i + 1}`,
    date: `${20 - i} Nov`,
    priorityScore: 0.95 - (i * 0.02),
  }));

  multiSourcePoller.syncFeedsToQueue = async () => ({ discovered: 20, enqueued: 20, jobs: [] });
  multiSourcePoller.getTopRankedArticles = async () => mock20Articles;

  const mockBot = {
    telegram: {
      sendMessage: async (chatId, text) => ({ message_id: 1, text }),
      editMessageText: async () => true,
    },
  };

  startBroadcastScheduler(mockBot);

  // Allow async tasks to run
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

  // Exactly 1 article executed (the #1 ranked, Mock Article 1)
  assert.equal(pipelineCallCount, 1);
  assert.equal(processedUrls.length, 1);
  assert.equal(processedUrls[0], 'https://www.cnbcindonesia.com/market/mock-article-1');

  // Restore env
  process.env.TELEGRAM_NEWS_GROUP_ID = prevGroupId || '';
  process.env.BROADCAST_MODE = prevMode || '';
  process.env.NEWS_POLL_INTERVAL_MS = prevInterval || '';
  process.env.BROADCAST_CATCHUP = prevCatchup || '';

  pipelineService.runPipeline = originalRunPipeline;
  multiSourcePoller.syncFeedsToQueue = originalSyncFeedsToQueue;
  multiSourcePoller.getTopRankedArticles = originalGetTopRankedArticles;
});

test('startBroadcastScheduler respects BROADCAST_MAX_PER_POLL limit in instant mode', async () => {
  const prevGroupId = process.env.TELEGRAM_NEWS_GROUP_ID;
  const prevMode = process.env.BROADCAST_MODE;
  const prevInterval = process.env.NEWS_POLL_INTERVAL_MS;
  const prevCatchup = process.env.BROADCAST_CATCHUP;
  const prevMaxPerPoll = process.env.BROADCAST_MAX_PER_POLL;

  process.env.TELEGRAM_NEWS_GROUP_ID = '-1009999999999';
  process.env.BROADCAST_MODE = 'instant';
  process.env.NEWS_POLL_INTERVAL_MS = '9999999';
  process.env.BROADCAST_CATCHUP = 'true';
  process.env.BROADCAST_MAX_PER_POLL = '1';

  let pipelineCallCount = 0;
  const processedUrls = [];

  pipelineService.runPipeline = async (params) => {
    pipelineCallCount += 1;
    processedUrls.push(params.input.url);
    return {
      logId: 300,
      published: true,
      publishResult: { platformPostUrl: 'https://instagram.com/p/limit' },
    };
  };

  multiSourcePoller.syncFeedsToQueue = async () => ({ discovered: 3, enqueued: 3, jobs: [] });
  multiSourcePoller.getTopRankedArticles = async () => [
    { title: 'Article A', url: 'https://www.cnbcindonesia.com/market/article-a', date: '3 Nov', priorityScore: 0.9 },
    { title: 'Article B', url: 'https://insight.kontan.co.id/news/article-b', date: '2 Nov', priorityScore: 0.8 },
    { title: 'Article C', url: 'https://www.antaranews.com/berita/article-c', date: '1 Nov', priorityScore: 0.7 },
  ];

  const mockBot = {
    telegram: {
      sendMessage: async (chatId, text) => ({ message_id: 1, text }),
      editMessageText: async () => true,
    },
  };

  startBroadcastScheduler(mockBot);

  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

  // Only 1 article processed because maxPerPoll = 1
  assert.equal(pipelineCallCount, 1);
  assert.equal(processedUrls.length, 1);

  // Restore env
  process.env.TELEGRAM_NEWS_GROUP_ID = prevGroupId || '';
  process.env.BROADCAST_MODE = prevMode || '';
  process.env.NEWS_POLL_INTERVAL_MS = prevInterval || '';
  process.env.BROADCAST_CATCHUP = prevCatchup || '';
  process.env.BROADCAST_MAX_PER_POLL = prevMaxPerPoll || '';

  pipelineService.runPipeline = originalRunPipeline;
  multiSourcePoller.syncFeedsToQueue = originalSyncFeedsToQueue;
  multiSourcePoller.getTopRankedArticles = originalGetTopRankedArticles;
});

test('startBroadcastScheduler pauses with safety throttle delay between consecutive articles', async () => {
  const prevGroupId = process.env.TELEGRAM_NEWS_GROUP_ID;
  const prevMode = process.env.BROADCAST_MODE;
  const prevInterval = process.env.NEWS_POLL_INTERVAL_MS;
  const prevCatchup = process.env.BROADCAST_CATCHUP;
  const prevDelay = process.env.BROADCAST_INSTANT_DELAY_MS;

  process.env.TELEGRAM_NEWS_GROUP_ID = '-1009999999999';
  process.env.BROADCAST_MODE = 'instant';
  process.env.NEWS_POLL_INTERVAL_MS = '9999999';
  process.env.BROADCAST_CATCHUP = 'true';
  process.env.BROADCAST_INSTANT_DELAY_MS = '30';

  const timestamps = [];

  pipelineService.runPipeline = async () => {
    timestamps.push(Date.now());
    return {
      logId: 400,
      published: true,
      publishResult: { platformPostUrl: 'https://instagram.com/p/delay' },
    };
  };

  multiSourcePoller.syncFeedsToQueue = async () => ({ discovered: 2, enqueued: 2, jobs: [] });
  multiSourcePoller.getTopRankedArticles = async () => [
    { title: 'Article 1', url: 'https://www.cnbcindonesia.com/market/article-1', date: '2 Nov', priorityScore: 0.9 },
    { title: 'Article 2', url: 'https://insight.kontan.co.id/news/article-2', date: '1 Nov', priorityScore: 0.8 },
  ];

  const mockBot = {
    telegram: {
      sendMessage: async (chatId, text) => ({ message_id: 1, text }),
      editMessageText: async () => true,
    },
  };

  startBroadcastScheduler(mockBot);

  await new Promise((resolve) => {
    setTimeout(resolve, 80);
  });

  assert.equal(timestamps.length, 2);
  const diff = timestamps[1] - timestamps[0];
  assert.ok(diff >= 25, `Expected delay >= 25ms, got ${diff}ms`);

  // Restore env
  process.env.TELEGRAM_NEWS_GROUP_ID = prevGroupId || '';
  process.env.BROADCAST_MODE = prevMode || '';
  process.env.NEWS_POLL_INTERVAL_MS = prevInterval || '';
  process.env.BROADCAST_CATCHUP = prevCatchup || '';
  process.env.BROADCAST_INSTANT_DELAY_MS = prevDelay || '0';

  pipelineService.runPipeline = originalRunPipeline;
  multiSourcePoller.syncFeedsToQueue = originalSyncFeedsToQueue;
  multiSourcePoller.getTopRankedArticles = originalGetTopRankedArticles;
});
