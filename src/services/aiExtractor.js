const OpenAI = require('openai');
const promptService = require('./promptService');

const VERIFIED_FIGURES = {
  prabowo: { name: 'Prabowo Subianto', role: 'Presiden RI' },
  'prabowo subianto': { name: 'Prabowo Subianto', role: 'Presiden RI' },
  jokowi: { name: 'Joko Widodo', role: 'Presiden ke-7 RI' },
  'joko widodo': { name: 'Joko Widodo', role: 'Presiden ke-7 RI' },
  'sri mulyani': { name: 'Sri Mulyani Indrawati', role: 'Menteri Keuangan RI' },
  'sri mulyani indrawati': { name: 'Sri Mulyani Indrawati', role: 'Menteri Keuangan RI' },
  'perry warjiyo': { name: 'Perry Warjiyo', role: 'Gubernur Bank Indonesia' },
  'erick thohir': { name: 'Erick Thohir', role: 'Menteri BUMN RI' },
  'luhut binsar pandjaitan': { name: 'Luhut Binsar Pandjaitan', role: 'Penasihat Khusus Presiden' },
  'luhut pandjaitan': { name: 'Luhut Binsar Pandjaitan', role: 'Penasihat Khusus Presiden' },
  'bahlil lahadalia': { name: 'Bahlil Lahadalia', role: 'Menteri ESDM RI' },
  'jahja setiaatmadja': { name: 'Jahja Setiaatmadja', role: 'Presiden Direktur PT Bank Central Asia Tbk' },
  'darmawan junaidi': { name: 'Darmawan Junaidi', role: 'Direktur Utama PT Bank Mandiri Tbk' },
  sunarso: { name: 'Sunarso', role: 'Direktur Utama PT Bank Rakyat Indonesia Tbk' },
  'royke tumilaar': { name: 'Royke Tumilaar', role: 'Direktur Utama PT Bank Negara Indonesia Tbk' },
};

const VALID_CATEGORIES = [
  'IDX MARKET WATCH',
  'PERBANKAN',
  'EMITEN',
  'MAKRO',
  'REGULASI',
  'NASIONAL',
];

/**
 * Sanitizes and validates an Indonesian stock ticker (4-letter code).
 * @param {string} code
 * @returns {string|null}
 */
function sanitizeTicker(code) {
  if (!code || typeof code !== 'string') return null;
  const clean = code.trim().replace(/^\$+/, '').toUpperCase();
  return /^[A-Z]{4}$/.test(clean) ? clean : null;
}

/**
 * Resolves a person name against the verified public figures registry.
 * @param {Object} rawPerson - { name?: string, role?: string }
 * @returns {Object|null}
 */
function resolvePerson(rawPerson) {
  if (!rawPerson || typeof rawPerson !== 'object' || !rawPerson.name) {
    return null;
  }

  const rawName = String(rawPerson.name).trim();
  const lower = rawName.toLowerCase();
  const placeholders = ['null', 'none', 'n/a', 'undefined', '-', ''];
  if (placeholders.includes(lower)) {
    return null;
  }

  const verified = VERIFIED_FIGURES[lower];
  const name = verified ? verified.name : rawName;
  let role = null;
  if (rawPerson.role && !placeholders.includes(String(rawPerson.role).toLowerCase())) {
    role = String(rawPerson.role).trim();
  } else if (verified) {
    role = verified.role;
  }

  return { name, role };
}

/**
 * Extracts entities, category, headline, and composition mode from an article.
 * @param {Object} article - { title, text, source, url }
 * @param {string} nicheCode - default 'finance'
 * @param {OpenAI} [openaiClient]
 * @returns {Promise<Object>}
 */
async function extractArticleEntities(article, nicheCode = 'finance', openaiClient = null) {
  const promptRecord = await promptService.getActivePrompt(nicheCode, 'entity_extraction');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey && !openaiClient) {
    throw new Error('OPENAI_API_KEY is not set in environment.');
  }

  const openai = openaiClient || new OpenAI({ apiKey });
  const model = process.env.TEXT_MODEL || promptRecord.config?.model || 'gpt-4o';

  const userContent = [
    `Title: ${article.title || 'Market Update'}`,
    `Source: ${article.source || 'Unknown'}`,
    article.url ? `URL: ${article.url}` : null,
    'Content:',
    (article.text || article.title || '').slice(0, 4000),
  ].filter(Boolean).join('\n');

  const completion = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: promptRecord.systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: promptRecord.config?.temperature ?? 0.2,
  });

  const rawJson = completion.choices[0]?.message?.content;
  if (!rawJson) {
    throw new Error('Empty response from OpenAI Chat Completion during entity extraction');
  }

  const parsed = JSON.parse(rawJson);

  // Validate stocks
  let stocks = [];
  if (Array.isArray(parsed.stocks)) {
    const seen = new Set();
    stocks = parsed.stocks
      .map((item) => {
        const rawCode = typeof item === 'string' ? item : item?.ticker;
        const cleanTicker = sanitizeTicker(rawCode);
        if (!cleanTicker || seen.has(cleanTicker)) return null;
        seen.add(cleanTicker);
        return {
          ticker: cleanTicker,
          name: (typeof item === 'object' && item?.name) ? item.name : cleanTicker,
        };
      })
      .filter(Boolean);
  }

  // Validate person
  const person = resolvePerson(parsed.person);

  // Determine composition mode
  const hasPerson = Boolean(person && person.name);
  const hasStocks = stocks.length > 0;
  let compositionMode = 'macro_general';
  if (hasPerson && hasStocks) {
    compositionMode = 'both';
  } else if (hasPerson && !hasStocks) {
    compositionMode = 'person_only';
  } else if (!hasPerson && hasStocks) {
    compositionMode = 'stocks_only';
  }

  // Normalize category
  let category = String(parsed.category || 'IDX MARKET WATCH').trim().toUpperCase();
  if (!VALID_CATEGORIES.includes(category)) {
    category = 'IDX MARKET WATCH';
  }

  const headline = String(parsed.headline || article.title || 'IDX MARKET UPDATE').trim().toUpperCase();
  const subtitle = String(parsed.subtitle || article.title || '').trim();

  return {
    category,
    headline,
    subtitle,
    person,
    stocks,
    composition_mode: compositionMode,
    draftCaption: parsed.caption || null,
  };
}

const CAROUSEL_SYSTEM_PROMPT = `You are an elite Indonesian financial editor and Instagram visual storytelling strategist for sovstock.
Transform the provided news article into an engaging, multi-slide Instagram carousel story (default 4 slides) that breaks down complex financial news into a compelling narrative arc:

Slide 1 (Cover / Hook):
- "headline": Uppercase, high-impact headline in Indonesian (max 8-10 words).
- "subtitle": Intriguing 1-sentence hook that makes readers swipe left.
- "visual_scene": Clear visual prompt description for background (modern Indonesian financial environment, Jakarta skyline, trading floor, or executive portrait).

Slide 2 (Context / Apa yang Terjadi?):
- "headline": Short punchy chapter title (e.g. "LATAR BELAKANG", "KRONOLOGI PERISTIWA").
- "subtitle": 1-2 concise sentences explaining why and how this event occurred.
- "visual_scene": Contextual visual scene description.

Slide 3 (Data / Fakta & Angka Kunci):
- "headline": Chapter title for key metrics (e.g. "FAKTA & ANGKA UTAMA", "PERGERAKAN EMITEN").
- "subtitle": Highlight key numeric facts, stock movements, deal values, or pivotal regulations.
- "visual_scene": 3D glassmorphic stock ticker cards and glowing data visualization.

Slide 4 (Impact / Kesimpulan & Diskusi):
- "headline": Chapter title for future outlook (e.g. "DAMPAK BAGI INVESTOR", "LANGKAH STRATEGIS").
- "subtitle": Strategic takeaway and a discussion-provoking question for comments.
- "visual_scene": Architectural financial monument with subtle ambient lighting.

Output strict JSON:
{
  "category": "IDX MARKET WATCH" | "PERBANKAN" | "EMITEN" | "MAKRO" | "REGULASI" | "NASIONAL",
  "headline": "...",
  "subtitle": "...",
  "story_angle": "Short phrase describing the narrative hook",
  "person": { "name": string|null, "role": string|null },
  "stocks": [{ "ticker": "BBCA", "name": "Bank Central Asia" }],
  "slides": [
    {
      "slide_number": 1,
      "slide_type": "cover" | "context" | "data" | "impact" | "conclusion",
      "chapter_title": "...",
      "headline": "...",
      "subtitle": "...",
      "visual_scene": "..."
    }
  ],
  "caption": "Engaging Instagram caption with hook, slide recap, swipe CTA (Geser ke kiri 👉), and hashtags (#sovstock #IHSG #SahamIndonesia #Investasi #PasarModal)"
}`;

/**
 * Extracts a multi-slide carousel story arc from an article.
 * @param {Object} article - { title, text, source, url }
 * @param {string} [nicheCode='finance']
 * @param {OpenAI} [openaiClient]
 * @param {Object} [options={}]
 * @returns {Promise<Object>}
 */
async function extractArticleCarouselStory(article, nicheCode = 'finance', openaiClient = null, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey && !openaiClient) {
    throw new Error('OPENAI_API_KEY is not set in environment.');
  }

  const openai = openaiClient || new OpenAI({ apiKey });
  const model = process.env.TEXT_MODEL || 'gpt-4o';
  const targetSlideCount = parseInt(options.slideCount || process.env.CAROUSEL_SLIDE_COUNT || '4', 10);

  const userContent = [
    `Title: ${article.title || 'Market Update'}`,
    `Source: ${article.source || 'Unknown'}`,
    article.url ? `URL: ${article.url}` : null,
    `Target Slide Count: ${targetSlideCount} slides`,
    'Content:',
    (article.text || article.title || '').slice(0, 4500),
  ].filter(Boolean).join('\n');

  let parsed = null;
  try {
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CAROUSEL_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.25,
    });

    const rawJson = completion.choices[0]?.message?.content;
    if (rawJson) {
      parsed = JSON.parse(rawJson);
    }
  } catch (err) {
    console.warn('[aiExtractor] OpenAI carousel story extraction failed, falling back:', err.message);
  }

  // Fallback if parsing failed or invalid
  if (!parsed || !Array.isArray(parsed.slides) || parsed.slides.length < 2) {
    const singleData = await extractArticleEntities(article, nicheCode, openai);
    return {
      category: singleData.category,
      headline: singleData.headline,
      subtitle: singleData.subtitle,
      person: singleData.person,
      stocks: singleData.stocks,
      story_angle: singleData.headline,
      slides: [
        {
          slide_number: 1,
          slide_type: 'cover',
          chapter_title: singleData.category,
          headline: singleData.headline,
          subtitle: singleData.subtitle,
          visual_scene: 'Modern Indonesian capital market backdrop with dramatic lighting.',
        },
        {
          slide_number: 2,
          slide_type: 'context',
          chapter_title: 'RINGKASAN BERITA',
          headline: 'POKOK PERISTIWA',
          subtitle: singleData.subtitle || article.title || '',
          visual_scene: 'Futuristic glassmorphic financial network nodes and charts.',
        },
      ],
      draftCaption: singleData.draftCaption,
    };
  }

  // Validate stocks
  let stocks = [];
  if (Array.isArray(parsed.stocks)) {
    const seen = new Set();
    stocks = parsed.stocks
      .map((item) => {
        const rawCode = typeof item === 'string' ? item : item?.ticker;
        const cleanTicker = sanitizeTicker(rawCode);
        if (!cleanTicker || seen.has(cleanTicker)) return null;
        seen.add(cleanTicker);
        return {
          ticker: cleanTicker,
          name: (typeof item === 'object' && item?.name) ? item.name : cleanTicker,
        };
      })
      .filter(Boolean);
  }

  // Validate person
  const person = resolvePerson(parsed.person);

  // Normalize category
  let category = String(parsed.category || 'IDX MARKET WATCH').trim().toUpperCase();
  if (!VALID_CATEGORIES.includes(category)) {
    category = 'IDX MARKET WATCH';
  }

  const headline = String(parsed.headline || article.title || 'IDX MARKET UPDATE').trim().toUpperCase();
  const subtitle = String(parsed.subtitle || article.title || '').trim();

  // Ensure slides have proper numbering and defaults
  const slides = parsed.slides.map((s, idx) => ({
    slide_number: s.slide_number || idx + 1,
    slide_type: s.slide_type || (idx === 0 ? 'cover' : 'context'),
    chapter_title: s.chapter_title || `CHAPTER 0${idx + 1}`,
    headline: String(s.headline || headline).trim().toUpperCase(),
    subtitle: String(s.subtitle || subtitle).trim(),
    visual_scene: String(s.visual_scene || 'Editorial Bloomberg style Jakarta market atmosphere').trim(),
  }));

  return {
    category,
    headline,
    subtitle,
    story_angle: parsed.story_angle || headline,
    person,
    stocks,
    slides,
    draftCaption: parsed.caption || null,
  };
}

module.exports = {
  extractArticleEntities,
  extractArticleCarouselStory,
  sanitizeTicker,
  resolvePerson,
};
