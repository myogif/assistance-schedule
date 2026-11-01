const test = require('node:test');
const assert = require('node:assert/strict');

const invezgoScraper = require('../src/services/invezgoScraper');
const broadcastScheduler = require('../src/services/broadcastScheduler');
const { handleBroadcastNow } = require('../src/bot/handlers');

test('handleBroadcastNow warns if a broadcast is already processing', async () => {
  const origIsProcessing = broadcastScheduler.isBroadcastProcessing;
  broadcastScheduler.isBroadcastProcessing = () => true;

  const replies = [];
  const mockCtx = {
    chat: { id: 123 },
    from: { id: 456, username: 'testadmin' },
    replyWithHTML: async (text) => {
      replies.push(text);
    },
  };

  await handleBroadcastNow(mockCtx);

  assert.equal(replies.length, 1);
  assert.match(replies[0], /Proses Sedang Berjalan/);

  broadcastScheduler.isBroadcastProcessing = origIsProcessing;
});

test('handleBroadcastNow handles empty article list', async () => {
  const origFetch = invezgoScraper.fetchInvezgoBlogList;
  invezgoScraper.fetchInvezgoBlogList = async () => [];

  const replies = [];
  const mockCtx = {
    chat: { id: 123 },
    from: { id: 456, username: 'testadmin' },
    replyWithHTML: async (text) => {
      replies.push(text);
      return { message_id: replies.length };
    },
  };

  await handleBroadcastNow(mockCtx);

  assert.equal(replies.length, 2);
  assert.match(replies[0], /Memulai broadcast/);
  assert.match(replies[1], /Tidak ada artikel ditemukan/);

  invezgoScraper.fetchInvezgoBlogList = origFetch;
});

test('handleBroadcastNow executes processArticleWithFeedback and notifies private caller', async () => {
  const origFetch = invezgoScraper.fetchInvezgoBlogList;
  const origProcess = broadcastScheduler.processArticleWithFeedback;
  const origGroupId = process.env.TELEGRAM_NEWS_GROUP_ID;

  process.env.TELEGRAM_NEWS_GROUP_ID = '-1008888888888';

  const mockArticle = {
    title: 'Bank Mandiri Bukukan Laba Bersih Rekor',
    url: 'https://invezgo.com/id/blog/bank-mandiri-rekor',
    date: '15 Nov 2026',
  };
  invezgoScraper.fetchInvezgoBlogList = async () => [mockArticle];

  let processedCall = null;
  broadcastScheduler.processArticleWithFeedback = async (bot, groupId, article, niche, opts) => {
    processedCall = {
      groupId,
      article,
      niche,
      opts,
    };
    return {
      logId: 88,
      published: true,
      extracted: { headline: 'Laba Rekor Bank Mandiri' },
      publishResult: { platformPostUrl: 'https://instagram.com/p/BMRI123' },
    };
  };

  const replies = [];
  const editedMessages = [];

  const mockCtx = {
    chat: { id: 123456 }, // private chat ID, different from target group
    from: { id: 999, username: 'superuser' },
    telegram: {
      editMessageText: async (chatId, messageId, inlineId, text) => {
        editedMessages.push({ chatId, messageId, text });
      },
    },
    replyWithHTML: async (text) => {
      replies.push(text);
      return { message_id: replies.length };
    },
  };

  await handleBroadcastNow(mockCtx);

  // 1. Started message
  assert.match(replies[0], /Memulai broadcast & auto-posting artikel terbaru/);

  // 2. Updated message showing target group
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
  invezgoScraper.fetchInvezgoBlogList = origFetch;
  broadcastScheduler.processArticleWithFeedback = origProcess;
  process.env.TELEGRAM_NEWS_GROUP_ID = origGroupId || '';
});
