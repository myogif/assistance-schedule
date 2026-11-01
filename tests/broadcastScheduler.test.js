const test = require('node:test');
const assert = require('node:assert/strict');

// Mock pipelineService before requiring broadcastScheduler
const pipelineService = require('../src/services/pipelineService');
const invezgoScraper = require('../src/services/invezgoScraper');

const originalRunPipeline = pipelineService.runPipeline;
const originalFetchInvezgoBlogList = invezgoScraper.fetchInvezgoBlogList;

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

test('buildArticleBroadcastMessage formats message with plain URL', () => {
  const article = {
    title: 'Saham BBCA & BBRI Melonjak <Hari Ini>',
    description: 'Analisis pergerakan saham perbankan',
    date: '10 Nov 2026',
    url: 'https://invezgo.com/id/blog/saham-bbca-bbri',
  };

  const message = buildArticleBroadcastMessage(article);
  assert.match(message, /📰 <b>INVEZGO — Artikel Baru<\/b>/);
  assert.match(message, /<b>Saham BBCA &amp; BBRI Melonjak &lt;Hari Ini&gt;<\/b>/);
  assert.match(message, /<i>Analisis pergerakan saham perbankan<\/i>/);
  assert.match(message, /🗓 10 Nov 2026/);
  assert.match(message, /🔗 https:\/\/invezgo\.com\/id\/blog\/saham-bbca-bbri/);
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
        editedMessages.push({
          chatId,
          messageId,
          text,
          extra,
        });
        return true;
      },
    },
  };

  const sampleArticle = {
    title: 'IHSG Menguat Tipis Ditopang Sektor Keuangan',
    url: 'https://invezgo.com/id/blog/ihsg-menguat-tipis',
    date: '12 Nov 2026',
  };

  // Mock runPipeline to simulate success
  pipelineService.runPipeline = async (params) => {
    assert.equal(params.input.url, sampleArticle.url);
    assert.equal(params.triggeredBy, 'broadcast_scheduler');
    // Call progress callback
    await params.onProgress(2, 4, 'Menganalisis artikel...');
    await params.onProgress(3, 4, 'Menghasilkan poster...');
    await params.onProgress(4, 4, 'Mengunggah ke Instagram...');

    return {
      logId: 42,
      status: 'published',
      published: true,
      extracted: {
        headline: 'IHSG Ditopang Saham Finansial',
        category: 'IDX MARKET',
      },
      publishResult: {
        postId: 'post_ig_12345',
        platformPostUrl: 'https://www.instagram.com/p/Cxyz123/',
      },
    };
  };

  const result = await processArticleWithFeedback(mockBot, -1001234567890, sampleArticle, 'finance');

  assert.equal(result.logId, 42);
  assert.equal(result.published, true);

  // Assert sent messages
  assert.equal(sentMessages.length, 2);
  // 1st message: formatted article broadcast with plain URL
  assert.match(sentMessages[0].text, /INVEZGO — Artikel Baru/);
  assert.match(sentMessages[0].text, /🔗 https:\/\/invezgo\.com\/id\/blog\/ihsg-menguat-tipis/);
  // 2nd message: initial progress message
  assert.match(sentMessages[1].text, /⏳ \[1\/4\]/);

  // Assert progress edits
  assert.ok(editedMessages.length >= 3);
  const lastEdit = editedMessages[editedMessages.length - 1];
  assert.match(lastEdit.text, /✅ <b>Berhasil Dipublikasikan ke Instagram:<\/b>/);
  assert.match(lastEdit.text, /Post ID:<\/b> <code>post_ig_12345<\/code>/);
  assert.match(lastEdit.text, /https:\/\/www\.instagram\.com\/p\/Cxyz123\//);
  assert.match(lastEdit.text, /Headline:<\/b> IHSG Ditopang Saham Finansial/);
});

test('processArticleWithFeedback edits message to error when pipeline fails', async () => {
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
        editedMessages.push({
          chatId,
          messageId,
          text,
          extra,
        });
        return true;
      },
    },
  };

  const sampleArticle = {
    title: 'Gagal Ekstraksi Artikel',
    url: 'https://invezgo.com/id/blog/gagal-artikel',
  };

  pipelineService.runPipeline = async () => {
    throw new Error('OpenAI quota exceeded');
  };

  await assert.rejects(
    async () => {
      await processArticleWithFeedback(mockBot, -1001234567890, sampleArticle, 'finance');
    },
    /OpenAI quota exceeded/,
  );

  assert.ok(editedMessages.length >= 1);
  const lastEdit = editedMessages[editedMessages.length - 1];
  assert.match(lastEdit.text, /❌ <b>Gagal Memproses Artikel ke Instagram:<\/b>/);
  assert.match(lastEdit.text, /OpenAI quota exceeded/);
});

test('startBroadcastScheduler processes queue immediately in instant mode', async () => {
  const prevGroupId = process.env.TELEGRAM_NEWS_GROUP_ID;
  const prevMode = process.env.BROADCAST_MODE;
  const prevInterval = process.env.INVEZGO_CHECK_INTERVAL_MS;

  process.env.TELEGRAM_NEWS_GROUP_ID = '-1009999999999';
  process.env.BROADCAST_MODE = 'instant';
  process.env.INVEZGO_CHECK_INTERVAL_MS = '9999999';

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

  invezgoScraper.fetchInvezgoBlogList = async () => [
    { title: 'Article 1', url: 'https://invezgo.com/id/blog/article-1', date: '1 Nov' },
    { title: 'Article 2', url: 'https://invezgo.com/id/blog/article-2', date: '2 Nov' },
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
  // Oldest first: article-2 is 2 Nov, article-1 is 1 Nov (in reverse of newest-first list)
  assert.equal(processedUrls.length, 2);

  // Restore env
  process.env.TELEGRAM_NEWS_GROUP_ID = prevGroupId || '';
  process.env.BROADCAST_MODE = prevMode || '';
  process.env.INVEZGO_CHECK_INTERVAL_MS = prevInterval || '';

  pipelineService.runPipeline = originalRunPipeline;
  invezgoScraper.fetchInvezgoBlogList = originalFetchInvezgoBlogList;
});

test('startBroadcastScheduler in slot mode processes 1 article on start when BROADCAST_PROCESS_ON_START=true', async () => {
  const prevGroupId = process.env.TELEGRAM_NEWS_GROUP_ID;
  const prevMode = process.env.BROADCAST_MODE;
  const prevOnStart = process.env.BROADCAST_PROCESS_ON_START;
  const prevInterval = process.env.INVEZGO_CHECK_INTERVAL_MS;

  process.env.TELEGRAM_NEWS_GROUP_ID = '-1009999999999';
  process.env.BROADCAST_MODE = 'slot';
  process.env.BROADCAST_PROCESS_ON_START = 'true';
  process.env.INVEZGO_CHECK_INTERVAL_MS = '9999999';

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

  invezgoScraper.fetchInvezgoBlogList = async () => [
    { title: 'Slot Newest', url: 'https://invezgo.com/id/blog/slot-newest', date: '3 Nov' },
    { title: 'Slot Oldest', url: 'https://invezgo.com/id/blog/slot-oldest', date: '1 Nov' },
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

  // Exactly 1 article processed on start (the oldest)
  assert.equal(pipelineCallCount, 1);
  assert.equal(processedUrls[0], 'https://invezgo.com/id/blog/slot-oldest');

  // Restore env
  process.env.TELEGRAM_NEWS_GROUP_ID = prevGroupId || '';
  process.env.BROADCAST_MODE = prevMode || '';
  process.env.BROADCAST_PROCESS_ON_START = prevOnStart || '';
  process.env.INVEZGO_CHECK_INTERVAL_MS = prevInterval || '';

  pipelineService.runPipeline = originalRunPipeline;
  invezgoScraper.fetchInvezgoBlogList = originalFetchInvezgoBlogList;
});
