const { Niche, Prompt } = require('../models');

// Color scheme constants for visual prompts
const COLOR_SCHEME = {
  NAVY_PRIMARY: '#001F3F',
  ORANGE_ACCENT: '#FF7A00',
  WHITE: '#FFFFFF',
};
const CAROUSEL_REFERENCE_STYLE_RULE = 'Reference design lock: match the supplied SOVSTOCK editorial cover language with a midnight navy city backdrop, realistic central subject, translucent glass panels with electric cyan edge light, oversized stacked white/cyan typography, and a bottom metrics bar. Preserve every supplied slide string exactly; never rewrite, omit, or invent text, numbers, tickers, logos, or data.';


// In-memory cache for active prompts: key = `${nicheCode}:${type}`
const promptCache = new Map();

/**
 * Clear in-memory prompt cache.
 */
function clearPromptCache() {
  promptCache.clear();
}

/**
 * Retrieves the active prompt for a given niche and prompt type.
 * @param {string} nicheCode - e.g. 'finance'
 * @param {string} type - 'entity_extraction' | 'visual_image' | 'caption_template'
 * @returns {Promise<Prompt>}
 */
async function getActivePrompt(nicheCode, type) {
  const cacheKey = `${nicheCode}:${type}`;
  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey);
  }

  const niche = await Niche.findOne({
    where: { code: nicheCode, isActive: true },
  });

  if (!niche) {
    throw new Error(`Active niche not found for code: "${nicheCode}"`);
  }

  const promptRecord = await Prompt.findOne({
    where: {
      nicheId: niche.id,
      type,
      isActive: true,
    },
    order: [['version', 'DESC']],
  });

  if (!promptRecord) {
    throw new Error(`Active prompt of type "${type}" not found for niche "${nicheCode}"`);
  }

  // Parse config if string
  if (typeof promptRecord.config === 'string') {
    try {
      promptRecord.config = JSON.parse(promptRecord.config);
    } catch (_) {
      // keep as is
    }
  }

  promptCache.set(cacheKey, promptRecord);
  return promptRecord;
}

/**
 * Lists all active prompts for a given niche.
 * @param {string} nicheCode
 * @returns {Promise<Array<Prompt>>}
 */
async function listPrompts(nicheCode) {
  const niche = await Niche.findOne({
    where: { code: nicheCode, isActive: true },
  });

  if (!niche) {
    throw new Error(`Active niche not found for code: "${nicheCode}"`);
  }

  return Prompt.findAll({
    where: { nicheId: niche.id, isActive: true },
    order: [['type', 'ASC']],
  });
}

/**
 * Updates a prompt for a niche, incrementing its version.
 * @param {string} nicheCode
 * @param {string} type
 * @param {Object} updateData - { systemPrompt?, userPromptTemplate?, config? }
 * @returns {Promise<Prompt>}
 */
async function updatePrompt(nicheCode, type, updateData = {}) {
  const currentPrompt = await getActivePrompt(nicheCode, type);

  const newVersion = (currentPrompt.version || 1) + 1;
  const newSystemPrompt = updateData.systemPrompt !== undefined ? updateData.systemPrompt : currentPrompt.systemPrompt;
  const newUserTemplate = updateData.userPromptTemplate !== undefined
    ? updateData.userPromptTemplate
    : currentPrompt.userPromptTemplate;
  const newConfig = updateData.config !== undefined ? updateData.config : currentPrompt.config;

  await currentPrompt.update({
    systemPrompt: newSystemPrompt,
    userPromptTemplate: newUserTemplate,
    config: typeof newConfig === 'object' && newConfig !== null ? newConfig : currentPrompt.config,
    version: newVersion,
  });

  // Invalidate cache
  const cacheKey = `${nicheCode}:${type}`;
  promptCache.delete(cacheKey);

  return currentPrompt;
}

const IHSG_DATA_INTEGRITY_INSTRUCTION = [
  'Market Data Integrity (MANDATORY): Never invent, estimate, recall, or reuse a market index level.',
  'For IHSG, render a numeric level only when an explicit current value is supplied in the input data (for example, $IHSG price).',
  'If no current IHSG value is supplied, show only "IHSG" or "Indeks Harga Saham Gabungan" and no numeric level.',
  'Do not use historical numbers from the headline/article as current data.',
].join(' ');

/**
 * Builds the visual prompt from the visual_image prompt template and extracted entities.
 * @param {Prompt} promptRecord
 * @param {Object} extracted
 * @returns {string}
 */
function buildVisualPrompt(promptRecord, extracted) {
  const {
    category = 'IDX MARKET WATCH',
    headline = 'MARKET UPDATE',
    subtitle = '',
    person = null,
    stocks = [],
    composition_mode: compositionMode = 'macro_general',
  } = extracted;

  const primaryStock = stocks?.[0] || null;
  const stockTicker = primaryStock?.ticker ? `$${primaryStock.ticker}` : '$IHSG';
  const stockName = primaryStock?.name || (primaryStock?.ticker ? `PT ${primaryStock.ticker} Tbk` : 'Indonesia Stock Exchange');
  const tickerList = stocks?.length > 0
    ? stocks.map((s) => `$${s.ticker} (${s.name || s.ticker})`).join(', ')
    : '$IHSG (Indeks Harga Saham Gabungan)';

  // Helper to format individual stock card
  function formatStockCard(s, idx) {
    const sTicker = s.ticker ? `$${s.ticker}` : '$IHSG';
    const sName = s.name || (s.ticker ? `PT ${s.ticker} Tbk` : 'Indonesia Stock Exchange');
    const sPrice = s.price ? `Rp ${s.price}` : null;
    const sChange = s.change_pct || null;
    const sDir = s.direction || 'flat';
    let sColor = 'neutral white';
    let sIndicator = sChange || '';
    if (sDir === 'up') {
      sColor = 'glowing green';
      sIndicator = `+${sChange}`;
    } else if (sDir === 'down') {
      sColor = 'glowing red';
      sIndicator = `-${sChange}`;
    }

    const priceInfo = sPrice && sChange
      ? `featuring bold price nominal ${sPrice}, ${sColor} indicator (${sIndicator})`
      : 'featuring clean prominent ticker badge';

    return `Card ${idx + 1} for ${sTicker} (${sName}) ${priceInfo}`;
  }

  let stockCardsDetail = '';
  if (stocks && stocks.length > 0) {
    if (stocks.length === 1) {
      stockCardsDetail = `Sleek editorial stock data card for ${formatStockCard(stocks[0], 0)}, with sharp candlestick curves with shallow depth of field`;
    } else {
      const cardsText = stocks.map((s, idx) => formatStockCard(s, idx)).join('; ');
      stockCardsDetail = `Dual sleek editorial stock data cards: ${cardsText}, each with sharp candlestick curves with shallow depth of field`;
    }
  } else {
    stockCardsDetail = 'Sleek editorial market index card for $IHSG (Indeks Harga Saham Gabungan) with dynamic market trend curve with shallow depth of field';
  }

  // Live price data for primary stock fallback
  const stockPrice = primaryStock?.price || '—';
  const stockChangePct = primaryStock?.change_pct || '—';
  const stockDirection = primaryStock?.direction || 'flat';
  let gainIndicator = stockChangePct;
  let gainColor = 'neutral white';
  if (stockDirection === 'up') {
    gainIndicator = `+${stockChangePct}`;
    gainColor = 'glowing green';
  } else if (stockDirection === 'down') {
    gainIndicator = `-${stockChangePct}`;
    gainColor = 'glowing red';
  }
  const personName = person?.name || 'Indonesian Business Leader';
  const personRole = person?.role ? ` (${person.role})` : '';

  let config = promptRecord.config || {};
  if (typeof config === 'string') {
    try { config = JSON.parse(config); } catch (_) { config = {}; }
  }

  const compositionModes = config.composition_modes || {};
  let compositionTemplate = compositionModes[compositionMode];

  if (!compositionTemplate) {
    if (compositionMode === 'both') {
      compositionTemplate = [
        'Upper-Center Composition & Visual Background (Occupying the upper 60% of the canvas):',
        '- Focal Point: A highly realistic, authoritative editorial portrait photo of {{personName}}{{personRole}} in a formal business suit with natural expression and cinematic warm amber & gold lighting, positioned prominently.',
        '- Left Flanking: Clean editorial market card for stock {{stockTicker}} ({{stockName}}) with Rp {{stockPrice}} {{gainColor}} {{gainIndicator}} and sharp candlestick chart.',
        '- Right Flanking: Jakarta financial district skyscrapers with warm dusk illumination, and corporate emblem card for {{stockName}}.',
      ].join('\n');
    } else if (compositionMode === 'person_only') {
      compositionTemplate = [
        'Upper-Center Composition & Visual Background (Occupying the upper 60% of the canvas):',
        '- Focal Point: Authentic photojournalistic executive portrait of {{personName}}{{personRole}} with cinematic warm amber & gold lighting.',
        '- Background: Modern Indonesian financial architecture or executive boardroom with warm ambient lighting.',
      ].join('\n');
    } else if (compositionMode === 'stocks_only') {
      compositionTemplate = [
        'Upper-Center Composition & Visual Background (Occupying the upper 55% of the canvas):',
        '- Focal Point: {{stockCardsDetail}}, positioned symmetrically in the upper half.',
        '- Background: Modern Indonesia Stock Exchange (IDX) trading floor backdrop with warm ambient lighting.',
      ].join('\n');
    } else {
      compositionTemplate = [
        'Upper-Center Composition & Visual Background (Occupying the upper 55% of the canvas):',
        '- Focal Point: Monumental Indonesian financial architecture bathed in cinematic warm amber and dusk golden light.',
      ].join('\n');
    }
  }

  let compositionDetails = compositionTemplate
    .replace(/\{\{stockCardsDetail\}\}/g, stockCardsDetail)
    .replace(/\{\{personName\}\}/g, personName)
    .replace(/\{\{personRole\}\}/g, personRole)
    .replace(/\{\{stockTicker\}\}/g, stockTicker)
    .replace(/\{\{stockName\}\}/g, stockName)
    .replace(/\{\{tickerList\}\}/g, tickerList)
    .replace(/\{\{stockPrice\}\}/g, stockPrice)
    .replace(/\{\{gainIndicator\}\}/g, gainIndicator)
    .replace(/\{\{gainColor\}\}/g, gainColor);

  if (stocks && stocks.length > 0) {
    compositionDetails += '\n- Visual Data Integrity: Accurately render only the exact ticker symbols and nominals provided above. Do not invent unverified numbers or fake stock prices.';
  }

  const defaultVisualTemplate = [
    'Format: Tall portrait 4:5 editorial poster (1080x1350 portrait format) for Instagram feed. The entire canvas is vertical/portrait orientation — DO NOT generate a square or landscape image.',
    'Style & Aesthetic: Ultra-sharp realistic photojournalistic editorial cover aesthetic, cinematic warm golden amber & navy (#001F3F) lighting, high contrast, clean centered typography integration, vibrant bright orange (#FF7A00) and crisp white (#FFFFFF) dual-tone typography, 8k resolution. Natural real-world executive portraits and authentic financial atmosphere, zero floating sci-fi neon or abstract 3D gimmicks.',
    '',
    '{{composition_details}}',
    '',
    'Bottom-Center Typography & Information Structure (Strictly Anchored at Lower-Center / Bottom 45%):',
    "1. Category Tag / Micro-Typography Bar: Centered category badge '— {{category}} —' in clean tracked uppercase sans-serif with subtle flanking labels ('INDONESIA CAPITAL MARKETS' on left, 'MARKETS & INSIGHTS' on right), positioned directly above the headline at lower-center.",
    '2. Centered Dual-Tone Headline Typography: All headline lines are strictly center-aligned across the poster width, located at the bottom-center of the poster. Massive bold condensed uppercase typography reading "{{headline}}". Action keywords and prominent financial numbers are styled in vibrant bright orange (#FF7A00), while entity and person names are in crisp bold white (#FFFFFF).',
    '3. Centered Subtitle: Set directly below the headline, perfectly center-aligned across the horizontal axis: "{{subtitle}}".',
    '4. Visual Hierarchy Invariant: The entire text block (category badge, massive headline, and subtitle) is strictly anchored at the lower-center / bottom 45% of the poster, serving as the visual anchor and foundation, leaving the upper 55% clean, open, and dramatic for the authentic visual subject, portrait, and warm lighting atmosphere.',
    '',
    'Footer & Branding Elements (Anchored at the very bottom edge):',
    '- Bottom Metrics Bar: Three horizontal icon columns: [Chart icon] STRATEGIC INVESTMENTS | [Leaf icon] SUSTAINABLE GROWTH | [People icon] A STRONGER INDONESIA.',
    "- Official Footer Branding: Centered elegant dark navy shield emblem logo with gold crown and gold letter 'S' watermark, bold branding text 'SOVSTOCK', and tagline 'MARKET INSIGHTS FOR A BRIGHTER TOMORROW' placed at the bottom edge beneath the text block.",
  ].join('\n');

  let visualPrompt = (promptRecord && promptRecord.systemPrompt) ? promptRecord.systemPrompt : defaultVisualTemplate;
  visualPrompt = visualPrompt
    .replace(/\{\{composition_details\}\}/g, compositionDetails)
    .replace(/\{\{category\}\}/g, category)
    .replace(/\{\{headline\}\}/g, headline)
    .replace(/\{\{subtitle\}\}/g, subtitle);

  return `${visualPrompt}\n\n${IHSG_DATA_INTEGRITY_INSTRUCTION}`;
}

/**
 * Builds and sanitizes an Instagram caption from the caption_template prompt.
 * @param {Prompt} promptRecord
 * @param {Object} extracted
 * @param {string} source
 * @returns {string}
 */
function buildCaption(promptRecord, extracted, source = 'Editorial') {
  let config = promptRecord.config || {};
  if (typeof config === 'string') {
    try { config = JSON.parse(config); } catch (_) { config = {}; }
  }

  const forbiddenWords = config.forbidden_words || [];
  const defaultHashtags = config.default_hashtags || '#sovstock #SahamIndonesia #IHSG #Investasi #PasarModal';
  const disclaimerText = config.disclaimer
    || 'Disclaimer: Informasi ini disajikan murni untuk tujuan edukasi dan berita pasar modal.';
  const brandTag = config.brand_tag || '#sovstock';

  let caption = '';

  if (extracted.draftCaption && extracted.draftCaption.length > 50) {
    caption = extracted.draftCaption.trim();
  } else {
    const template = promptRecord.systemPrompt || '{{hook}}\n\n{{summary}}\n\n{{why_it_matters}}\n\n{{cta}}\n\n{{source}}\n\n{{hashtags}}\n\n{{disclaimer}}';
    const hook = `🔥 ${extracted.headline || 'MARKET UPDATE'}`;
    const summary = extracted.subtitle || 'Perkembangan penting yang menjadi sorotan pasar dan arah kebijakan.';
    const whyItMatters = 'Kenapa ini penting?\nPerkembangan strategis ini memberikan pengaruh terhadap sentimen dan prospek pasar secara menyeluruh.';
    const cta = 'Menurut kamu, bagaimana dampaknya?\nTulis pendapatmu di kolom komentar!';
    const sourceText = `Sumber: ${source || 'Editorial'}`;

    caption = template
      .replace(/\{\{hook\}\}/g, hook)
      .replace(/\{\{summary\}\}/g, summary)
      .replace(/\{\{why_it_matters\}\}/g, whyItMatters)
      .replace(/\{\{cta\}\}/g, cta)
      .replace(/\{\{source\}\}/g, sourceText)
      .replace(/\{\{hashtags\}\}/g, defaultHashtags)
      .replace(/\{\{disclaimer\}\}/g, disclaimerText);
  }

  // Remove forbidden words
  forbiddenWords.forEach((forbidden) => {
    const regex = new RegExp(forbidden, 'gi');
    caption = caption.replace(regex, '');
  });

  // Ensure brand tag is present
  if (brandTag && !caption.includes(brandTag)) {
    caption = `${caption.trimEnd()}\n\n${brandTag}`;
  }

  // Ensure disclaimer is present
  if (disclaimerText && !caption.includes('Disclaimer:')) {
    caption = `${caption.trimEnd()}\n\n---\n${disclaimerText}`;
  }

  return caption.trim();
}

/**
 * Builds the visual prompt for a specific carousel slide.
 * @param {Object} slide - { slide_number, slide_type, chapter_title, headline, subtitle, visual_scene }
 * @param {Object} carouselData - Overall carousel data with category, headline, stocks, etc.
 * @param {Object} [options={}] - { totalSlides?: number }
 * @returns {string}
 */
function buildCarouselSlidePrompt(slide, carouselData, options = {}) {
  const totalSlides = options.totalSlides || (Array.isArray(carouselData.slides) ? carouselData.slides.length : 4);
  const slideNumber = slide.slide_number || 1;
  const isCover = slideNumber === 1 || slide.slide_type === 'cover';
  const isLast = slideNumber === totalSlides;
  const category = carouselData.category || 'IDX MARKET WATCH';

  const chapterBadge = isCover
    ? `— ${category} —`
    : `— SLIDE ${slideNumber}/${totalSlides} • ${slide.chapter_title || 'STORY'} —`;

  const footerAction = isLast
    ? '[Discussion icon] TULIS PENDAPAT DI KOMENTAR | [Share icon] BAGIKAN KE REKAN INVESTOR'
    : `[Swipe icon] GESER KE KIRI (SLIDE ${slideNumber + 1}/${totalSlides}) | [Bookmark icon] SIMPAN POSTINGAN`;

  // Stocks data insertion for data slide
  let stockVisualDetail = '';
  if (slide.slide_type === 'data' && carouselData.stocks && carouselData.stocks.length > 0) {
    const cardsText = carouselData.stocks.map((s, idx) => {
      const ticker = s.ticker ? `$${s.ticker}` : '$IHSG';
      const name = s.name || ticker;
      const priceText = s.price ? `Rp ${s.price}` : '';
      const changeText = s.change_pct ? `(${s.direction === 'down' ? '-' : '+'}${s.change_pct})` : '';
      return `Card ${idx + 1}: ${ticker} (${name}) ${priceText} ${changeText}`.trim();
    }).join('; ');
    stockVisualDetail = `\n- Market Data Cards: Translucent glassmorphic data cards with electric cyan edge light displaying ${cardsText} exactly, with a restrained chart using only supplied market movement data.`;
  }

  if (isCover) {
    return [
      'Format: Tall portrait 4:5 editorial poster (1080x1350 portrait format) for Instagram carousel slide. Match the supplied reference image composition; the entire canvas is strictly vertical/portrait — DO NOT generate a square or landscape image.',
      'Style & Aesthetic: Cinematic SOVSTOCK financial editorial cover, midnight navy #001F3F city-at-night backdrop, realistic high-detail central executive portrait, translucent glassmorphic panels with electric cyan #00D2FF edge light, crisp white #FFFFFF typography, premium 8k magazine finish.',
      '',
      `Reference Composition (Slide 1 of ${totalSlides}):`,
      `- Hero Scene: ${slide.visual_scene || 'Realistic Indonesian capital-markets executive in a formal dark suit, centered and dominant against a Jakarta financial skyline at blue hour, with cinematic rim light.'}${stockVisualDetail}`,
      '- Upper-Left Panel: Large translucent glass quote/summary panel with cyan glowing border; render the supplied subtitle exactly, with no invented quote or attribution.',
      `- Lower-Left Panel: Translucent glass market card for only the supplied tickers and figures; use a restrained chart and show stock movement colors only when the supplied data includes them.`,
      `- Right Panel: Translucent glass corporate/market identity panel using only supplied company, person, ticker, and source information; never invent a logo or statistic.`,
      '',
      'Bottom Typography & Information Structure (Strictly Anchored at Lower 40%):',
      `1. Category Badge: Centered cyan-glowing outlined badge '${chapterBadge}' above the headline.`,
      `2. Oversized Stacked Headline: Render the exact headline "${slide.headline}" as bold condensed uppercase typography; use large white #FFFFFF and electric cyan #00D2FF emphasis blocks without changing any words.`,
      `3. Subtitle: Render the exact text "${slide.subtitle}" below the headline in white #FFFFFF.`,
      '4. Bottom Metrics Bar: Thin cyan-glowing divider with the fixed SOVSTOCK editorial labels STRATEGIC INVESTMENTS | SUSTAINABLE GROWTH | A STRONGER INDONESIA.',
      '',
      'Footer & Branding Elements:',
      `- Carousel Indicator: ${footerAction}`,
      "- Official Footer Branding: Centered SOVSTOCK shield/crown mark with restrained gold emblem detail, white brand text, and the tagline 'MARKET INSIGHTS FOR A BRIGHTER TOMORROW' at the bottom edge.",
      '',
      '- Visual Data Integrity: Accurately render only the exact text, names, tickers, and numbers supplied above. Do not invent unverified numbers, fake ticker symbols, logos, or random text.',
      `- ${CAROUSEL_REFERENCE_STYLE_RULE}`,
    ].join('\n');
  }

  // Slide 2+ (Content Slides / Rangkuman Berita)
  let bulletSection = '';
  if (Array.isArray(slide.bullet_points) && slide.bullet_points.length > 0) {
    const points = slide.bullet_points.map((bp) => `• [${bp.label}]: ${bp.detail}`).join('\n  ');
    bulletSection = `- Structured Factual Points: white #FFFFFF text in a translucent glass panel with cyan #00D2FF bullets and labels; render every supplied label and detail exactly.\n  ${points}`;
  } else {
    bulletSection = `- Structured Factual Summary: white #FFFFFF text in a translucent glass panel with cyan #00D2FF separators; render exact supplied figures, percentages, and events.`;
  }

  return [
    'Format: Tall portrait 4:5 editorial poster (1080x1350 portrait format) for Instagram carousel slide. Match the supplied reference image composition; the entire canvas is strictly vertical/portrait — DO NOT generate a square or landscape image.',
    'Style & Aesthetic: Cinematic SOVSTOCK financial editorial layout, midnight navy #001F3F city-at-night backdrop, realistic high-detail subject, translucent glassmorphic panels with electric cyan #00D2FF edge light, crisp white #FFFFFF typography, premium 8k magazine finish.',
    '',
    `Reference Composition (Slide ${slideNumber} of ${totalSlides}):`,
    `- Hero Scene: ${slide.visual_scene || 'Realistic Indonesian capital-markets scene at blue hour with a prominent subject or corporate architecture, cinematic rim light, and a deep navy city background.'}${stockVisualDetail}`,
    '- Glass Panel System: Use layered translucent glass panels with thin cyan glowing borders for the quote, context, data, and source information. Keep the upper visual field cinematic and uncluttered.',
    '',
    'Top Header & Typography:',
    `- Section Badge: Centered cyan-glowing outlined badge '${chapterBadge}' above the main text.`,
    `- Chapter Headline: Render the exact headline "${slide.headline}" as oversized bold condensed uppercase typography, with white #FFFFFF and electric cyan #00D2FF emphasis blocks.`,
    '',
    'Body & Structured Content:',
    bulletSection,
    `- Narrative Summary: Render the exact subtitle "${slide.subtitle}" in white #FFFFFF inside the glass information system.`,
    '',
    'Lower Accent & Footnote:',
    `- Subject Panel: Authentic cutout portrait or corporate visual for ${carouselData.person?.name || 'the supplied subject'}, integrated into the lower corner with cyan rim light; do not invent identity details.`,
    `- Source Panel: 'Sumber: ${carouselData.source || 'Editorial'}' in white #FFFFFF on a translucent glass footer panel.`,
    '',
    'Bottom Typography & Branding:',
    '- Bottom Metrics Bar: Thin cyan-glowing divider with the fixed labels STRATEGIC INVESTMENTS | SUSTAINABLE GROWTH | A STRONGER INDONESIA.',
    `- Carousel Indicator: ${footerAction}`,
    "- Official Footer Branding: Centered SOVSTOCK shield/crown mark with restrained gold emblem detail, white brand text, and the tagline 'MARKET INSIGHTS FOR A BRIGHTER TOMORROW' at the bottom edge.",
    '',
    '- Visual Data Integrity: Accurately render only the exact text, names, tickers, and numbers supplied above. Do not invent unverified numbers, fake ticker symbols, logos, or random text.',
    `- ${CAROUSEL_REFERENCE_STYLE_RULE}`,
  ].join('\n');
}

/**
 * Builds an Instagram caption tailored for a multi-slide carousel story.
 * @param {Object} carouselData
 * @param {string} [source='Invezgo']
 * @returns {string}
 */
function buildCarouselCaption(carouselData, source = 'Invezgo') {
  const headline = carouselData.headline || 'MARKET STORY';
  const category = carouselData.category || 'IDX MARKET WATCH';
  const slides = Array.isArray(carouselData.slides) ? carouselData.slides : [];

  if (carouselData.draftCaption && carouselData.draftCaption.length > 60) {
    let draft = carouselData.draftCaption.trim();
    if (!draft.includes('👉 Geser') && !draft.includes('swipe')) {
      draft = `${draft}\n\n👉 Geser ke kiri (swipe) untuk membaca rangkuman visual lengkap!`;
    }
    if (!draft.includes('Disclaimer:')) {
      draft = `${draft}\n\n---\nDisclaimer: Informasi ini disajikan murni untuk tujuan edukasi dan berita pasar modal. Keputusan investasi sepenuhnya berada di tangan investor.`;
    }
    return draft;
  }

  const lines = [
    `🚨 ${headline}`,
    '',
    `Rangkuman visual cerita pasar: #${category.replace(/\s+/g, '')}`,
    '',
    '👉 Geser ke kiri (swipe) untuk membaca setiap slide:',
  ];

  slides.slice(1).forEach((slide, idx) => {
    lines.push(`📌 [Slide ${idx + 2}] ${slide.headline}: ${slide.subtitle}`);
    if (Array.isArray(slide.bullet_points) && slide.bullet_points.length > 0) {
      slide.bullet_points.forEach((bp) => {
        lines.push(`   • ${bp.label}: ${bp.detail}`);
      });
    }
  });

  lines.push('');
  lines.push('💬 Bagaimana pandangan Anda tentang perkembangan ini? Tulis pendapat Anda di kolom komentar!');
  lines.push('');
  lines.push(`Sumber: ${source || 'Editorial'}`);
  lines.push('#sovstock #IHSG #SahamIndonesia #Investasi #PasarModal #CarouselSaham #EdukasiSaham');
  lines.push('');
  lines.push('---');
  lines.push('Disclaimer: Informasi ini disajikan murni untuk tujuan edukasi dan berita pasar modal, bukan merupakan ajakan membeli atau menjual efek tertentu. Keputusan investasi sepenuhnya berada di tangan investor.');

  return lines.join('\n');
}

module.exports = {
  COLOR_SCHEME,
  getActivePrompt,
  listPrompts,
  updatePrompt,
  clearPromptCache,
  buildVisualPrompt,
  buildCaption,
  buildCarouselSlidePrompt,
  buildCarouselCaption,
};
