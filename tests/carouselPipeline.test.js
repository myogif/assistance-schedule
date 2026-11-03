process.env.NODE_ENV = 'test';
process.env.BROADCAST_INSTANT_DELAY_MS = '0';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Niche, Prompt, sequelize } = require('../src/models');
const aiExtractor = require('../src/services/aiExtractor');
const promptService = require('../src/services/promptService');
const pipelineService = require('../src/services/pipelineService');
const zernioPublisher = require('../src/services/zernioPublisher');
const imageGenerator = require('../src/services/imageGenerator');

test.before(async () => {
  await sequelize.sync({ force: true });
  await Niche.create({
    id: 1,
    code: 'finance',
    name: 'SOVSTOCK Financial',
    description: 'Financial test niche',
    isActive: true,
  });
  await Prompt.create({
    nicheId: 1,
    type: 'visual_image',
    name: 'Visual Prompt',
    systemPrompt: 'Visual prompt {{composition_details}} {{headline}} {{subtitle}}',
    version: 1,
    isActive: true,
  });
  await Prompt.create({
    nicheId: 1,
    type: 'caption_template',
    name: 'Caption Prompt',
    systemPrompt: '{{hook}}\n{{summary}}\n{{disclaimer}}',
    version: 1,
    isActive: true,
  });
  await Prompt.create({
    nicheId: 1,
    type: 'entity_extraction',
    name: 'Entity Extraction Prompt',
    systemPrompt: 'Extract financial entities from the following text.',
    version: 1,
    isActive: true,
  });
});

test('extractArticleCarouselStory extracts structured 4-slide narrative from article', async () => {
  const mockOpenAI = {
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  category: 'IDX MARKET WATCH',
                  headline: 'IHSG REBOUND KE 5.282',
                  subtitle: 'BBCA dan ASII menahan pelemahan indeks.',
                  story_angle: 'Kekuatan saham big cap menopang IHSG',
                  person: { name: 'Jahja Setiaatmadja', role: 'Presiden Direktur PT Bank Central Asia Tbk' },
                  stocks: [
                    { ticker: 'BBCA', name: 'Bank Central Asia' },
                    { ticker: 'ASII', name: 'Astra International' },
                  ],
                  slides: [
                    {
                      slide_number: 1,
                      slide_type: 'cover',
                      chapter_title: 'IDX MARKET WATCH',
                      headline: 'IHSG REBOUND KE 5.282',
                      subtitle: 'Pasar saham bangkit ditopang dua raksasa.',
                      visual_scene: 'Jakarta Stock Exchange trading floor at dusk.',
                    },
                    {
                      slide_number: 2,
                      slide_type: 'context',
                      chapter_title: 'LATAR BELAKANG',
                      headline: 'SENTIMEN MEMBAIK',
                      subtitle: 'Arus modal asing mulai mencatatkan net buy setelah tekanan jual.',
                      visual_scene: 'Glassmorphic corporate analytics card with executive atmosphere.',
                    },
                    {
                      slide_number: 3,
                      slide_type: 'data',
                      chapter_title: 'DATA KUNCI',
                      headline: 'DUET BBCA & ASII',
                      subtitle: 'BBCA naik +0.90% dan ASII melompat +2.35%.',
                      visual_scene: 'Dual floating 3D ticker cards with glowing candlestick lines.',
                    },
                    {
                      slide_number: 4,
                      slide_type: 'conclusion',
                      chapter_title: 'OUTLOOK INVESTOR',
                      headline: 'APA LANGKAH ANDA?',
                      subtitle: 'Apakah rebound ini awal dari reli baru? Tulis di komentar.',
                      visual_scene: 'Bank Indonesia monument with ambient electric cyan lighting.',
                    },
                  ],
                  caption: 'Analisis mendalam pergerakan IHSG hari ini. Geser ke kiri 👉',
                }),
              },
            },
          ],
        }),
      },
    },
  };

  const sampleArticle = {
    title: 'IHSG Rebound ke 5.282',
    text: 'IHSG ditutup menguat ditopang saham perbankan dan otomotif...',
    source: 'Invezgo',
    url: 'https://invezgo.com/id/blog/ihsg-rebound',
  };

  const result = await aiExtractor.extractArticleCarouselStory(sampleArticle, 'finance', mockOpenAI);

  assert.equal(result.category, 'IDX MARKET WATCH');
  assert.equal(result.headline, 'IHSG REBOUND KE 5.282');
  assert.equal(result.slides.length, 4);
  assert.equal(result.slides[0].slide_type, 'cover');
  assert.equal(result.slides[2].slide_type, 'data');
  assert.equal(result.stocks.length, 2);
  assert.equal(result.stocks[0].ticker, 'BBCA');
});

test('buildCarouselSlidePrompt properly anchors slide number and visual data integrity', () => {
  const carouselData = {
    category: 'PERBANKAN',
    headline: 'LABA BBCA CATAT REKOR',
    subtitle: 'Pertumbuhan kredit solid di kuartal III.',
    stocks: [
      {
        ticker: 'BBCA', name: 'Bank Central Asia', price: '5.025', change_pct: '0.90%', direction: 'up',
      },
    ],
  };

  const coverSlide = {
    slide_number: 1,
    slide_type: 'cover',
    headline: 'LABA BBCA CATAT REKOR',
    subtitle: 'Pertumbuhan kredit solid di kuartal III.',
    visual_scene: 'BCA Tower in Sudirman Jakarta at dusk.',
  };

  const coverPrompt = promptService.buildCarouselSlidePrompt(coverSlide, carouselData, { totalSlides: 4 });
  assert.match(coverPrompt, /— PERBANKAN —/);
  assert.match(coverPrompt, /Slide 1 of 4/);
  assert.match(coverPrompt, /Visual Data Integrity/);
  assert.match(coverPrompt, /photojournalistic editorial cover aesthetic/i);
  assert.match(coverPrompt, /warm golden amber/i);
  assert.match(coverPrompt, /#FF7A00/);
  assert.match(coverPrompt, /#FFFFFF/);

  const dataSlide = {
    slide_number: 3,
    slide_type: 'data',
    chapter_title: 'DATA EMITEN',
    headline: 'KINERJA FINANSIAL',
    subtitle: 'Pertumbuhan laba bersih mencapai 12.8% YoY.',
    visual_scene: '3D financial dashboard.',
  };

  const dataPrompt = promptService.buildCarouselSlidePrompt(dataSlide, carouselData, { totalSlides: 4 });
  assert.match(dataPrompt, /SLIDE 3\/4 • DATA EMITEN/);
  assert.match(dataPrompt, /\$BBCA \(Bank Central Asia\) Rp 5\.025/);
  assert.match(dataPrompt, /#0B0E14/);
  assert.match(dataPrompt, /#FF7A00/);

  const contentSlideWithBullets = {
    slide_number: 2,
    slide_type: 'context',
    chapter_title: 'POSISI KAS & PARKIR DANA',
    headline: 'POSISI KAS & PARKIR DANA (30 APR 2026)',
    subtitle: 'Dana ditempatkan di instrumen likuid.',
    bullet_points: [
      { label: 'Posisi Kas', detail: 'Rp123,03 T per 30 Apr 2026, 88% dari total aset' },
      { label: 'Asal Dana', detail: 'Modal Rp70 T dividen BUMN + Patriot Bonds Rp68,4 T' },
    ],
  };
  const bulletPrompt = promptService.buildCarouselSlidePrompt(contentSlideWithBullets, {
    ...carouselData,
    source: 'Invezgo',
    person: { name: 'Jahja Setiaatmadja' },
  }, { totalSlides: 4 });
  assert.match(bulletPrompt, /• \[Posisi Kas\]: Rp123,03 T per 30 Apr 2026/);
  assert.match(bulletPrompt, /• \[Asal Dana\]: Modal Rp70 T dividen BUMN/);
  assert.match(bulletPrompt, /Sumber: Invezgo/);
  assert.match(bulletPrompt, /Jahja Setiaatmadja/);
});
test('buildCarouselCaption formats multi-slide swipe instruction and recap', () => {
  const carouselData = {
    headline: 'THE FED TAHAN SUKU BUNGA',
    category: 'MAKRO',
    slides: [
      { slide_number: 1, headline: 'THE FED TAHAN BUNGA', subtitle: 'Voting 10-2 di FOMC.' },
      { slide_number: 2, headline: 'ALASAN THE FED', subtitle: 'Inflasi belum stabil di target 2%.' },
      { slide_number: 3, headline: 'DAMPAK PASAR', subtitle: 'Dolar AS menguat, rupiah tertahan.' },
      { slide_number: 4, headline: 'KESIMPULAN', subtitle: 'Investor wait and see.' },
    ],
  };

  const caption = promptService.buildCarouselCaption(carouselData, 'Invezgo');
  assert.match(caption, /👉 Geser ke kiri \(swipe\)/);
  assert.match(caption, /\[Slide 2\] ALASAN THE FED/);
  assert.match(caption, /\[Slide 3\] DAMPAK PASAR/);
  assert.match(caption, /Disclaimer:/);

  const carouselDataWithBullets = {
    headline: 'POSISI KAS DAN PARKIR DANA',
    category: 'MAKRO',
    slides: [
      { slide_number: 1, headline: 'COVER', subtitle: 'Kas 123T' },
      {
        slide_number: 2,
        headline: 'POSISI KAS',
        subtitle: 'Kas melimpah.',
        bullet_points: [
          { label: 'Posisi Kas', detail: 'Rp123,03 T' },
        ],
      },
    ],
  };
  const bulletCaption = promptService.buildCarouselCaption(carouselDataWithBullets, 'Invezgo');
  assert.match(bulletCaption, /• Posisi Kas: Rp123,03 T/);
});

test('extractArticleCarouselStory fallback properly initializes structured bullet_points', async () => {
  const brokenMockOpenAI = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('OpenAI API rate limit or network fail');
        },
      },
    },
  };

  const sampleArticle = {
    title: 'Bank Mandiri Bukukan Laba Bersih Rekor',
    text: 'PT Bank Mandiri Tbk mencatat kenaikan laba bersih yang signifikan.',
    source: 'Invezgo',
    url: 'https://invezgo.com/id/blog/bank-mandiri-laba',
  };

  const result = await aiExtractor.extractArticleCarouselStory(sampleArticle, 'finance', brokenMockOpenAI);
  assert.ok(Array.isArray(result.slides));
  assert.equal(result.slides.length, 2);
  assert.ok(Array.isArray(result.slides[0].bullet_points));
  assert.ok(Array.isArray(result.slides[1].bullet_points));
  assert.ok(result.slides[1].bullet_points.length > 0);
  assert.equal(result.slides[1].bullet_points[0].label, 'Pokok Berita');
});
test('runPipeline in carousel mode executes multi-image publishing flow', async () => {
  const originalGenerateCarouselImages = imageGenerator.generateCarouselImages;
  const originalPublishToInstagram = zernioPublisher.publishToInstagram;
  const originalExtractCarousel = aiExtractor.extractArticleCarouselStory;

  let publishParamsReceived = null;
  let carouselImagesCalled = false;
  const mockSlides = [
    {
      slide_number: 1, slide_type: 'cover', headline: 'SLIDE 1', subtitle: 'Sub 1', visual_scene: 'Scene 1',
    },
    {
      slide_number: 2, slide_type: 'context', headline: 'SLIDE 2', subtitle: 'Sub 2', visual_scene: 'Scene 2',
    },
    {
      slide_number: 3, slide_type: 'data', headline: 'SLIDE 3', subtitle: 'Sub 3', visual_scene: 'Scene 3',
    },
    {
      slide_number: 4, slide_type: 'conclusion', headline: 'SLIDE 4', subtitle: 'Sub 4', visual_scene: 'Scene 4',
    },
  ];
  aiExtractor.extractArticleCarouselStory = async () => ({
    category: 'IDX MARKET WATCH',
    headline: 'UJI COBA CAROUSEL STORYTELLING',
    subtitle: 'Rangkuman cerita 4 slide.',
    story_angle: 'Story angle',
    person: null,
    stocks: [{ ticker: 'BBCA', name: 'Bank Central Asia' }],
    slides: mockSlides,
    draftCaption: 'Caption carousel cerita pasar 👉 swipe',
  });

  imageGenerator.generateCarouselImages = async () => {
    carouselImagesCalled = true;
    return {
      imagePath: '/tmp/slide-1.png',
      imagePaths: ['/tmp/slide-1.png', '/tmp/slide-2.png', '/tmp/slide-3.png', '/tmp/slide-4.png'],
      slideCount: 4,
      durationSeconds: 1.2,
      visualPrompt: 'Visual prompt slide 1',
    };
  };

  zernioPublisher.publishToInstagram = async (params) => {
    publishParamsReceived = params;
    return {
      success: true,
      postId: 'post_carousel_test_999',
      status: 'published',
      platformPostUrl: 'https://instagram.com/p/carousel999',
      isCarousel: true,
      mediaCount: 4,
    };
  };

  const result = await pipelineService.runPipeline({
    nicheCode: 'finance',
    input: {
      title: 'Uji Coba Carousel Storytelling',
      text: 'Berita pengujian alur cerita carousel...',
      source: 'Invezgo',
      url: 'https://invezgo.com/id/blog/uji-carousel',
    },
    triggeredBy: '@test_user',
    postFormat: 'carousel',
  });

  assert.equal(result.isCarousel, true);
  assert.equal(carouselImagesCalled, true);
  assert.ok(publishParamsReceived);
  assert.equal(publishParamsReceived.imagePaths.length, 4);
  assert.equal(result.imagePaths.length, 4);
  assert.equal(result.published, true);
  assert.equal(result.publishResult.postId, 'post_carousel_test_999');

  // Restore originals
  imageGenerator.generateCarouselImages = originalGenerateCarouselImages;
  zernioPublisher.publishToInstagram = originalPublishToInstagram;
  aiExtractor.extractArticleCarouselStory = originalExtractCarousel;
});

test('runPipeline in single mode remains 100% backward compatible', async () => {
  const originalGenerateEditorialImage = imageGenerator.generateEditorialImage;
  const originalPublishToInstagram = zernioPublisher.publishToInstagram;
  const originalExtractEntities = aiExtractor.extractArticleEntities;

  let singleImageGenerated = false;
  let publishParamsReceived = null;

  aiExtractor.extractArticleEntities = async () => ({
    category: 'IDX MARKET WATCH',
    headline: 'UJI COBA SINGLE MODE',
    subtitle: 'Sub single mode',
    person: null,
    stocks: [],
    composition_mode: 'macro_general',
    draftCaption: 'Single caption',
  });
  imageGenerator.generateEditorialImage = async () => {
    singleImageGenerated = true;
    return {
      imagePath: '/tmp/single.png',
      imagePaths: ['/tmp/single.png'],
      model: 'dall-e-3',
      durationSeconds: 0.8,
      visualPrompt: 'Single prompt',
    };
  };

  zernioPublisher.publishToInstagram = async (params) => {
    publishParamsReceived = params;
    return {
      success: true,
      postId: 'post_single_test_111',
      status: 'published',
      platformPostUrl: 'https://instagram.com/p/single111',
      isCarousel: false,
      mediaCount: 1,
    };
  };

  const result = await pipelineService.runPipeline({
    nicheCode: 'finance',
    input: {
      title: 'Uji Coba Single Mode Standard',
      text: 'Berita pengujian mode single biasa...',
      source: 'Invezgo',
      url: 'https://invezgo.com/id/blog/uji-single',
    },
    triggeredBy: '@test_user',
    postFormat: 'single',
  });

  assert.equal(result.isCarousel, false);
  assert.equal(singleImageGenerated, true);
  assert.ok(publishParamsReceived);
  assert.equal(publishParamsReceived.imagePaths.length, 1);
  assert.equal(result.published, true);

  // Restore originals
  imageGenerator.generateEditorialImage = originalGenerateEditorialImage;
  zernioPublisher.publishToInstagram = originalPublishToInstagram;
  aiExtractor.extractArticleEntities = originalExtractEntities;
});
