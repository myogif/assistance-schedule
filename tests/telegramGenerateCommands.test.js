process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const pipelineService = require('../src/services/pipelineService');
const handlers = require('../src/bot/handlers');

test('handleGenerateCommand rejects invalid URL with guidance message', async () => {
  let repliedHtml = '';
  const mockCtx = {
    message: { text: '/generate' },
    replyWithHTML: async (msg) => {
      repliedHtml = msg;
    },
  };

  await handlers.handleGenerateCommand(mockCtx);
  assert.match(repliedHtml, /⚠️ <b>Format Perintah Salah<\/b>/);
  assert.match(repliedHtml, /\/generate &lt;URL artikel&gt;/);
});

test('handleGenerateCommand runs pipeline with skipPublish: true, postFormat: single and delivers photo + <pre> caption', async () => {
  const originalRunPipeline = pipelineService.runPipeline;

  // Create temporary test image
  const tmpImgPath = path.join(__dirname, 'test-gen-poster.png');
  fs.writeFileSync(tmpImgPath, 'dummy-poster-bytes');

  let pipelineArgs = null;
  let photoSent = null;
  const htmlReplies = [];

  pipelineService.runPipeline = async (args) => {
    pipelineArgs = args;
    return {
      logId: 101,
      imagePath: tmpImgPath,
      imagePaths: [tmpImgPath],
      isCarousel: false,
      extracted: { headline: 'IHSG MENGUAT 1.5%', category: 'IDX MARKET WATCH' },
      caption: 'Analisis IHSG Menguat.\n\nDisclaimer: Edukasi investasi.',
    };
  };

  const mockCtx = {
    message: { text: `/generate https://invezgo.com/id/blog/ihsg-menguat` },
    from: { username: 'investor_pro' },
    chat: { id: 12345 },
    reply: async () => ({ message_id: 99 }),
    telegram: { editMessageText: async () => {} },
    replyWithHTML: async (msg) => { htmlReplies.push(msg); },
    replyWithPhoto: async (photo, extra) => { photoSent = { photo, extra }; },
  };

  try {
    await handlers.handleGenerateCommand(mockCtx);

    // Verify pipeline call
    assert.equal(pipelineArgs.skipPublish, true);
    assert.equal(pipelineArgs.postFormat, 'single');
    assert.equal(pipelineArgs.input.url, 'https://invezgo.com/id/blog/ihsg-menguat');

    // Verify photo sent
    assert.ok(photoSent);
    assert.equal(photoSent.photo.source, tmpImgPath);

    // Verify status and caption formatted with <pre>
    const captionMsg = htmlReplies.find((m) => m.includes('<pre>'));
    assert.ok(captionMsg, 'Expected a message containing <pre> block for Instagram caption');
    assert.match(captionMsg, /<pre>Analisis IHSG Menguat\./);
  } finally {
    pipelineService.runPipeline = originalRunPipeline;
    if (fs.existsSync(tmpImgPath)) fs.unlinkSync(tmpImgPath);
  }
});

test('handleGenerateCarouselCommand runs pipeline with skipPublish: true, postFormat: carousel and delivers media group + <pre> caption', async () => {
  const originalRunPipeline = pipelineService.runPipeline;

  // Create temporary test images
  const tmpImg1 = path.join(__dirname, 'test-slide-1.png');
  const tmpImg2 = path.join(__dirname, 'test-slide-2.png');
  fs.writeFileSync(tmpImg1, 'dummy-slide-1');
  fs.writeFileSync(tmpImg2, 'dummy-slide-2');

  let pipelineArgs = null;
  let mediaGroupSent = null;
  const htmlReplies = [];

  pipelineService.runPipeline = async (args) => {
    pipelineArgs = args;
    return {
      logId: 202,
      imagePaths: [tmpImg1, tmpImg2],
      isCarousel: true,
      extracted: { headline: 'POSISI KAS DAN STRATEGI EMITEN', category: 'MAKRO' },
      caption: '🚨 POSISI KAS DAN STRATEGI EMITEN\n\n👉 Geser ke kiri (swipe)\n📌 [Slide 2] Kas: Rp123 T',
    };
  };

  const mockCtx = {
    message: { text: `/gencarousel https://invezgo.com/id/blog/kas-emiten` },
    from: { username: 'investor_pro' },
    chat: { id: 12345 },
    reply: async () => ({ message_id: 88 }),
    telegram: { editMessageText: async () => {} },
    replyWithHTML: async (msg) => { htmlReplies.push(msg); },
    replyWithMediaGroup: async (media) => { mediaGroupSent = media; },
  };

  try {
    await handlers.handleGenerateCarouselCommand(mockCtx);

    // Verify pipeline call
    assert.equal(pipelineArgs.skipPublish, true);
    assert.equal(pipelineArgs.postFormat, 'carousel');

    // Verify media group sent
    assert.ok(mediaGroupSent);
    assert.equal(mediaGroupSent.length, 2);
    assert.equal(mediaGroupSent[0].type, 'photo');
    assert.equal(mediaGroupSent[0].media.source, tmpImg1);
    assert.equal(mediaGroupSent[1].media.source, tmpImg2);

    // Verify caption message with <pre>
    const captionMsg = htmlReplies.find((m) => m.includes('<pre>'));
    assert.ok(captionMsg, 'Expected a message containing <pre> block for Carousel caption');
    assert.match(captionMsg, /<pre>🚨 POSISI KAS DAN STRATEGI EMITEN/);
  } finally {
    pipelineService.runPipeline = originalRunPipeline;
    if (fs.existsSync(tmpImg1)) fs.unlinkSync(tmpImg1);
    if (fs.existsSync(tmpImg2)) fs.unlinkSync(tmpImg2);
  }
});

test('handleArticleMessage with !generate and !gencarousel routes correctly and delivers media', async () => {
  const originalRunPipeline = pipelineService.runPipeline;

  const tmpImg = path.join(__dirname, 'test-msg-poster.png');
  fs.writeFileSync(tmpImg, 'dummy-bytes');

  let lastArgs = null;
  let photoSent = null;
  const htmlReplies = [];

  pipelineService.runPipeline = async (args) => {
    lastArgs = args;
    return {
      logId: 303,
      imagePath: tmpImg,
      imagePaths: [tmpImg],
      isCarousel: false,
      extracted: { headline: 'DIVIDEN BBRI', category: 'PERBANKAN' },
      caption: 'BBRI tebar dividen rekor.',
    };
  };

  const mockCtx = {
    message: { text: `https://invezgo.com/id/blog/dividen-bbri !generate` },
    from: { username: 'investor_pro' },
    chat: { id: 12345 },
    reply: async () => ({ message_id: 77 }),
    telegram: { editMessageText: async () => {} },
    replyWithHTML: async (msg) => { htmlReplies.push(msg); },
    replyWithPhoto: async (photo, extra) => { photoSent = { photo, extra }; },
  };

  try {
    await handlers.handleArticleMessage(mockCtx);
    assert.equal(lastArgs.skipPublish, true);
    assert.equal(lastArgs.postFormat, 'single');
    assert.ok(photoSent);
    assert.ok(htmlReplies.some((m) => m.includes('<pre>BBRI tebar dividen rekor.</pre>')));
  } finally {
    pipelineService.runPipeline = originalRunPipeline;
    if (fs.existsSync(tmpImg)) fs.unlinkSync(tmpImg);
  }
});
