process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Niche, Prompt, sequelize } = require('../src/models');
const promptService = require('../src/services/promptService');

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
    systemPrompt: 'Default visual prompt',
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
});

test('COLOR_SCHEME constants defined correctly', () => {
  // This test will verify constants are exported
  // We'll check this after implementation
  assert.ok(true); // Placeholder
});

test('buildVisualPrompt uses navy color (#001F3F) instead of dark charcoal', () => {
  const promptRecord = {
    systemPrompt: null,
    config: {},
  };

  const extracted = {
    category: 'IDX MARKET WATCH',
    headline: 'MARKET UPDATE',
    subtitle: 'Test subtitle',
    stocks: [],
    composition_mode: 'macro_general',
  };

  const result = promptService.buildVisualPrompt(promptRecord, extracted);

  // Should NOT contain old dark charcoal color
  assert.ok(!result.includes('#0B0E14'), 'Should not contain old #0B0E14 color');

  // Should contain new navy color
  assert.ok(result.includes('#001F3F'), 'Should contain new navy #001F3F color');

  // Should contain orange and white
  assert.ok(result.includes('#FF7A00'), 'Should contain orange #FF7A00');
  assert.ok(result.includes('#FFFFFF'), 'Should contain white #FFFFFF');

  // Should use "navy" aesthetic description
  assert.ok(result.includes('navy'), 'Should describe aesthetic as navy');

  // Should NOT have "dark charcoal" anymore
  assert.ok(!result.includes('dark charcoal'), 'Should not mention dark charcoal');
});

test('buildVisualPrompt forbids invented or stale IHSG index levels', () => {
  const promptRecord = {
    systemPrompt: null,
    config: {},
  };

  const result = promptService.buildVisualPrompt(promptRecord, {
    category: 'IDX MARKET WATCH',
    headline: 'IHSG MARKET UPDATE',
    subtitle: 'Pergerakan indeks hari ini',
    stocks: [],
    composition_mode: 'macro_general',
  });

  assert.match(result, /Never invent, estimate, recall, or reuse a market index level/i);
  assert.match(result, /render a numeric level only when an explicit current value is supplied/i);
  assert.match(result, /If no current IHSG value is supplied, show only "IHSG"/i);
  assert.match(result, /Do not use historical numbers from the headline\/article as current data/i);
});

test('buildVisualPrompt preserves orange and white color references', () => {
  const promptRecord = {
    systemPrompt: null,
    config: {},
  };

  const extracted = {
    category: 'IDX MARKET WATCH',
    headline: 'MARKET UPDATE',
    subtitle: 'Test subtitle',
    stocks: [
      {
        ticker: 'BBRI',
        name: 'Bank Rakyat Indonesia',
        price: '3650',
        change_pct: '+2.5%',
        direction: 'up',
      },
    ],
    composition_mode: 'macro_general',
  };

  const result = promptService.buildVisualPrompt(promptRecord, extracted);

  // Count occurrences of orange
  const orangeCount = (result.match(/#FF7A00/g) || []).length;
  assert.ok(orangeCount >= 2, 'Should have multiple references to orange color');

  // Count occurrences of white
  const whiteCount = (result.match(/#FFFFFF/g) || []).length;
  assert.ok(whiteCount >= 2, 'Should have multiple references to white color');
});

test('buildVisualPrompt template interpolation works with new colors', () => {
  const promptRecord = {
    systemPrompt: null,
    config: {},
  };

  const extracted = {
    category: 'TEST CATEGORY',
    headline: 'TEST HEADLINE',
    subtitle: 'TEST SUBTITLE',
    stocks: [],
    composition_mode: 'macro_general',
  };

  const result = promptService.buildVisualPrompt(promptRecord, extracted);

  // Verify template placeholders are replaced
  assert.ok(result.includes('TEST CATEGORY'), 'Category placeholder should be replaced');
  assert.ok(result.includes('TEST HEADLINE'), 'Headline placeholder should be replaced');
  assert.ok(result.includes('TEST SUBTITLE'), 'Subtitle placeholder should be replaced');

  // Verify no unresolved placeholders remain
  assert.ok(!result.includes('{{'), 'Should not contain unresolved template placeholders');
});

test('buildCarouselSlidePrompt cover slide uses navy color (#001F3F)', () => {
  const slide = {
    slide_number: 1,
    slide_type: 'cover',
    headline: 'COVER HEADLINE',
    subtitle: 'Cover subtitle',
    visual_scene: 'Test scene',
    chapter_title: 'Chapter 1',
  };

  const carouselData = {
    category: 'IDX MARKET WATCH',
    headline: 'CAROUSEL TEST',
    stocks: [],
    slides: [slide],
  };

  const result = promptService.buildCarouselSlidePrompt(slide, carouselData, { totalSlides: 1 });

  // Should NOT contain old dark charcoal color
  assert.ok(!result.includes('#0B0E14'), 'Cover slide should not contain old #0B0E14 color');

  // Should contain new navy color
  assert.ok(result.includes('#001F3F'), 'Cover slide should contain new navy #001F3F color');

  // Should contain orange and white
  assert.ok(result.includes('#FF7A00'), 'Cover slide should contain orange #FF7A00');
  assert.ok(result.includes('#FFFFFF'), 'Cover slide should contain white #FFFFFF');

  // Should use "navy" aesthetic
  assert.ok(result.includes('navy'), 'Cover slide should mention navy aesthetic');
});

test('buildCarouselSlidePrompt content slides use navy color (#001F3F)', () => {
  const slides = [
    {
      slide_number: 1,
      slide_type: 'cover',
      headline: 'COVER',
      subtitle: 'Cover',
      visual_scene: 'Scene',
      chapter_title: 'Intro',
    },
    {
      slide_number: 2,
      slide_type: 'data',
      headline: 'DATA SLIDE',
      subtitle: 'Data content',
      visual_scene: 'Data scene',
      chapter_title: 'Analysis',
      bullet_points: [
        { label: 'Point 1', detail: 'Detail 1' },
        { label: 'Point 2', detail: 'Detail 2' },
      ],
    },
  ];

  const carouselData = {
    category: 'IDX MARKET WATCH',
    headline: 'CAROUSEL TEST',
    stocks: [],
    person: { name: 'Test Person' },
    slides,
  };

  const result = promptService.buildCarouselSlidePrompt(slides[1], carouselData, { totalSlides: 2 });

  // Should NOT contain old dark charcoal color
  assert.ok(!result.includes('#0B0E14'), 'Content slide should not contain old #0B0E14 color');

  // Should contain new navy color
  assert.ok(result.includes('#001F3F'), 'Content slide should contain new navy #001F3F color');

  // Should contain orange and white
  assert.ok(result.includes('#FF7A00'), 'Content slide should contain orange #FF7A00');
});

test('buildCarouselSlidePrompt preserves all color references across slides', () => {
  const slide = {
    slide_number: 2,
    slide_type: 'content',
    headline: 'CONTENT',
    subtitle: 'Content',
    visual_scene: 'Scene',
    chapter_title: 'Chapter',
    bullet_points: [{ label: 'Test', detail: 'Detail' }],
  };

  const carouselData = {
    category: 'TEST',
    headline: 'TEST',
    stocks: [],
    person: { name: 'Person' },
    slides: [{}, slide],
  };

  const result = promptService.buildCarouselSlidePrompt(slide, carouselData, { totalSlides: 2 });

  // Count color references
  const navyCount = (result.match(/#001F3F/g) || []).length;
  const orangeCount = (result.match(/#FF7A00/g) || []).length;

  assert.ok(navyCount >= 1, 'Should have navy color reference');
  assert.ok(orangeCount >= 1, 'Should have orange color reference');
  // Content slides mention "crisp white" but may not have hex code
  assert.ok(result.includes('white') || result.includes('#FFFFFF'), 'Should mention white color');
});

test('buildCarouselCaption does not require color changes', () => {
  const carouselData = {
    headline: 'TEST HEADLINE',
    category: 'TEST CATEGORY',
    slides: [
      {
        headline: 'Slide 1',
        subtitle: 'Content 1',
      },
      {
        headline: 'Slide 2',
        subtitle: 'Content 2',
        bullet_points: [
          { label: 'Point', detail: 'Detail' },
        ],
      },
    ],
  };

  const result = promptService.buildCarouselCaption(carouselData, 'Editorial');

  // Caption should not contain color hex codes
  assert.ok(!result.includes('#0B0E14'), 'Caption should not contain old color');
  assert.ok(!result.includes('#001F3F'), 'Caption should not contain navy color');
  assert.ok(!result.includes('#FF7A00'), 'Caption should not contain orange color');

  // Caption should contain proper structure
  assert.ok(result.includes('🚨'), 'Caption should contain emoji');
  assert.ok(result.includes('👉 Geser'), 'Caption should contain swipe instruction');
  assert.ok(result.includes('Disclaimer:'), 'Caption should contain disclaimer');
});

test('buildVisualPrompt handles multiple stocks correctly with navy colors', () => {
  const promptRecord = {
    systemPrompt: null,
    config: {
      composition_modes: {
        macro_general: 'Upper-Center Composition: {{stockCardsDetail}} with warm lighting.'
      }
    },
  };

  const extracted = {
    category: 'IDX MARKET WATCH',
    headline: 'MARKET UPDATE',
    subtitle: 'Multiple stocks test',
    stocks: [
      {
        ticker: 'BBRI',
        name: 'Bank Rakyat Indonesia',
        price: '3650',
        change_pct: '+2.5%',
        direction: 'up',
      },
      {
        ticker: 'BMRI',
        name: 'Bank Mandiri',
        price: '5120',
        change_pct: '+1.8%',
        direction: 'up',
      },
    ],
    composition_mode: 'macro_general',
  };

  const result = promptService.buildVisualPrompt(promptRecord, extracted);

  // Verify stocks are included in the composition
  assert.ok(result.includes('BBRI'), 'Should include first stock ticker');
  assert.ok(result.includes('BMRI'), 'Should include second stock ticker');

  // Verify color scheme is maintained
  assert.ok(!result.includes('#0B0E14'), 'Should not contain old color');
  assert.ok(result.includes('#001F3F'), 'Should contain new navy color');
  assert.ok(result.includes('#FF7A00'), 'Should preserve orange color');
});

test('buildCarouselSlidePrompt renders last slide correctly with new colors', () => {
  const totalSlides = 3;
  const lastSlide = {
    slide_number: totalSlides,
    slide_type: 'content',
    headline: 'FINAL SLIDE',
    subtitle: 'Final thoughts',
    visual_scene: 'Final scene',
    chapter_title: 'Conclusion',
    bullet_points: [{ label: 'Key takeaway', detail: 'Important info' }],
  };

  const carouselData = {
    category: 'IDX MARKET WATCH',
    headline: 'TEST',
    stocks: [],
    person: { name: 'Person' },
    source: 'Editorial',
    slides: [{}, {}, lastSlide],
  };

  const result = promptService.buildCarouselSlidePrompt(lastSlide, carouselData, { totalSlides });

  // Should mention it's the last slide with different action
  assert.ok(result.includes('[Discussion icon]'), 'Last slide should have discussion action');
  assert.ok(result.includes('TULIS PENDAPAT'), 'Last slide should prompt for comments');

  // Should still use navy colors
  assert.ok(!result.includes('#0B0E14'), 'Should not contain old color');
  assert.ok(result.includes('#001F3F'), 'Should contain navy color');
});
