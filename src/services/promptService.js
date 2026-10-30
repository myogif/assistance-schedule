const { Niche, Prompt } = require('../models');

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

  // Live price data (injected if available, otherwise placeholder)
  const stockPrice = primaryStock?.price || '—';
  const stockChangePct = primaryStock?.change_pct || '—';
  const stockDirection = primaryStock?.direction || 'flat';
  const gainIndicator = stockDirection === 'up'
    ? `+${stockChangePct}`
    : stockDirection === 'down'
    ? `-${stockChangePct}`
    : `${stockChangePct}`;
  const gainColor = stockDirection === 'up' ? 'glowing green' : stockDirection === 'down' ? 'glowing red' : 'neutral white';

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
        '- Focal Point: A highly realistic, authoritative editorial portrait photo of {{personName}}{{personRole}}, positioned prominently.',
        '- Left Flanking: Floating 3D glassmorphic market card for stock {{stockTicker}} ({{stockName}}) with Rp {{stockPrice}} {{gainColor}} {{gainIndicator}} and glowing multi-bar candlestick chart.',
        '- Right Flanking: 3D glassmorphic corporate emblem card for {{stockName}} and Jakarta skyline.',
      ].join('\n');
    } else if (compositionMode === 'person_only') {
      compositionTemplate = [
        'Upper-Center Composition & Visual Background (Occupying the upper 60% of the canvas):',
        '- Focal Point: Executive editorial portrait of {{personName}}{{personRole}} with cinematic rim lighting.',
        '- Background: Modern monumental Indonesian financial architecture.',
      ].join('\n');
    } else if (compositionMode === 'stocks_only') {
      compositionTemplate = [
        'Upper-Center Composition & Visual Background (Occupying the upper 55% of the canvas):',
        '- Focal Point: Dual sleek 3D floating glassmorphic stock ticker cards for {{tickerList}} featuring Rp {{stockPrice}}, {{gainColor}} indicator {{gainIndicator}}, and glowing candlestick curves.',
        '- Background: Modern Indonesia Stock Exchange (IDX) trading floor backdrop.',
      ].join('\n');
    } else {
      compositionTemplate = [
        'Upper-Center Composition & Visual Background (Occupying the upper 55% of the canvas):',
        '- Focal Point: Monumental Indonesian financial architecture integrated with holographic market data streams.',
      ].join('\n');
    }
  }

  const compositionDetails = compositionTemplate
    .replace(/\{\{personName\}\}/g, personName)
    .replace(/\{\{personRole\}\}/g, personRole)
    .replace(/\{\{stockTicker\}\}/g, stockTicker)
    .replace(/\{\{stockName\}\}/g, stockName)
    .replace(/\{\{tickerList\}\}/g, tickerList)
    .replace(/\{\{stockPrice\}\}/g, stockPrice)
    .replace(/\{\{gainIndicator\}\}/g, gainIndicator)
    .replace(/\{\{gainColor\}\}/g, gainColor);

  const defaultVisualTemplate = [
    'Format: Tall portrait 4:5 editorial poster (1080x1350 portrait format) for Instagram feed. The entire canvas is vertical/portrait orientation — DO NOT generate a square or landscape image.',
    'Style & Aesthetic: Ultra-sharp Bloomberg Markets & Financial Times Weekend magazine cover aesthetic, high contrast, clean centered typography integration, dark navy blue (#060B14) background, electric cyan blue (#00D2FF) data accents, pristine editorial lighting, 8k resolution.',
    '',
    '{{composition_details}}',
    '',
    'Bottom-Center Typography & Information Structure (Strictly Anchored at Lower-Center / Bottom 45%):',
    "1. Category Tag / Micro-Typography Bar: Centered category badge '— {{category}} —' in clean tracked uppercase sans-serif with subtle flanking labels ('INDONESIA CAPITAL MARKETS' on left, 'MARKETS & INSIGHTS' on right), positioned directly above the headline at lower-center.",
    '2. Centered Dual-Tone Headline Typography: All headline lines are strictly center-aligned across the poster width, located at the bottom-center of the poster. Massive bold condensed uppercase typography reading "{{headline}}". Action and transaction keywords (such as \'BELI SAHAM\', \'TAHAN BUNGA\', \'CATAT LABA\', \'AKUISISI\', \'LEPAS\', \'TURUN\', \'NAIK\') are styled in luminous electric cyan blue (#00D2FF), while entity and person names are in crisp bold white (#FFFFFF).',
    '3. Centered Subtitle: Set directly below the headline, perfectly center-aligned across the horizontal axis: "{{subtitle}}".',
    '4. Visual Hierarchy Invariant: The entire text block (category badge, massive headline, and subtitle) is strictly anchored at the lower-center / bottom 45% of the poster, serving as the visual anchor and foundation, leaving the upper 55% clean, open, and dramatic for the visual subject, portrait, and architectural lighting atmosphere.',
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

  return visualPrompt;
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

module.exports = {
  getActivePrompt,
  listPrompts,
  updatePrompt,
  clearPromptCache,
  buildVisualPrompt,
  buildCaption,
};
