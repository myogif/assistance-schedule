module.exports = {
  up: async (queryInterface) => {
    const now = new Date();

    // 1. Insert Finance Niche
    await queryInterface.bulkInsert('Niches', [
      {
        id: 1,
        code: 'finance',
        name: 'SOVSTOCK Financial',
        description: 'Indonesian financial markets, IDX stocks, and macroeconomic updates by SOVSTOCK',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 2. Define Prompts
    const extractionSystemPrompt = `You are an expert Indonesian financial editor and news analyst for sovstock.
Analyze the provided news article and output a strict JSON object with the following fields:
1. "category": The single most appropriate category chosen from: "IDX MARKET WATCH", "PERBANKAN", "EMITEN", "MAKRO", "REGULASI", "NASIONAL".
2. "headline": An uppercase, punchy, editorial headline in Indonesian (max 8-10 words, high impact).
3. "subtitle": A concise, informative sentence in Indonesian explaining the headline (1 short sentence).
4. "person": An object with:
   - "name": Full name of the primary prominent Indonesian leader, minister, CEO, or public figure featured in the article, or null if no specific prominent figure is central.
   - "role": Their official role or title (e.g. "Presiden RI", "Direktur Utama PT Bank Central Asia Tbk", "Menteri Keuangan RI"), or null.
5. "stocks": An array of Indonesian stock objects featured as primary subjects, e.g. [{"ticker": "BBCA", "name": "Bank Central Asia"}]. Only legitimate 4-letter IDX codes. Return [] if none.
6. "composition_mode": Suggest one of: "both", "person_only", "stocks_only", "macro_general".
7. "caption": An engaging, professional Instagram caption in Indonesian with:
   - Attention-grabbing hook with emojis
   - Concise summary of the key news facts
   - Why it matters for investors and market significance
   - Call-to-action inviting discussion in the comments
   - Standard hashtags (#sovstock #IHSG #SahamIndonesia #Investasi #PasarModal)`;

    const visualSystemPrompt = `Format: Tall portrait 4:5 editorial poster (1080x1350 portrait format) for Instagram feed. The entire canvas is vertical/portrait orientation — DO NOT generate a square or landscape image.
Style & Aesthetic: Ultra-sharp Bloomberg Markets & Financial Times Weekend magazine cover aesthetic, high contrast, clean centered typography integration, dark navy blue (#060B14) background, electric cyan blue (#00D2FF) data accents, pristine editorial lighting, 8k resolution.

{{composition_details}}

Bottom-Center Typography & Information Structure (Strictly Anchored at Lower-Center / Bottom 45%):
1. Category Tag / Micro-Typography Bar: Centered category badge '— {{category}} —' in clean tracked uppercase sans-serif with subtle flanking labels ('INDONESIA CAPITAL MARKETS' on left, 'MARKETS & INSIGHTS' on right), positioned directly above the headline at lower-center.
2. Centered Dual-Tone Headline Typography: All headline lines are strictly center-aligned across the poster width, located at the bottom-center of the poster. Massive bold condensed uppercase typography reading "{{headline}}". Action and transaction keywords (such as 'BELI SAHAM', 'TAHAN BUNGA', 'CATAT LABA', 'AKUISISI', 'LEPAS', 'TURUN', 'NAIK') are styled in luminous electric cyan blue (#00D2FF), while entity and person names are in crisp bold white (#FFFFFF).
3. Centered Subtitle: Set directly below the headline, perfectly center-aligned across the horizontal axis: "{{subtitle}}".
4. Visual Hierarchy Invariant: The entire text block (category badge, massive headline, and subtitle) is strictly anchored at the lower-center / bottom 45% of the poster, serving as the visual anchor and foundation, leaving the upper 55% clean, open, and dramatic for the visual subject, portrait, and architectural lighting atmosphere.

Footer & Branding Elements (Anchored at the very bottom edge):
- Bottom Metrics Bar: Three horizontal icon columns: [Chart icon] STRATEGIC INVESTMENTS | [Leaf icon] SUSTAINABLE GROWTH | [People icon] A STRONGER INDONESIA.
- Official Footer Branding: Centered elegant dark navy shield emblem logo with gold crown and gold letter 'S' watermark, bold branding text 'SOVSTOCK', and tagline 'MARKET INSIGHTS FOR A BRIGHTER TOMORROW' placed at the bottom edge beneath the text block.`;

    const captionSystemPrompt = `{{hook}}

{{summary}}

{{why_it_matters}}

{{cta}}

{{source}}

{{hashtags}}

{{disclaimer}}`;

    const extractionConfig = JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const visualConfig = JSON.stringify({
      aspect_ratio: '4:5',
      size: '1088x1360',
      output_width: 1080,
      output_height: 1350,
      composition_modes: {
        both: [
          'Upper-Center Composition & Visual Background (Occupying the upper 60% of the canvas):',
          '- Focal Point: A highly realistic, authoritative editorial portrait photo of {{personName}}{{personRole}}, wearing a sharply tailored dark navy business suit, crisp white dress shirt, silk tie, elegant rectangular executive eyeglasses, confident expression at a 3/4 angle with cinematic cyan rim lighting, positioned prominently in the upper-center area.',
          '- Left Flanking Visual Elements:',
          '  1. Elegant glassmorphic executive quote card in quotation marks attributed to {{personName}}.',
          '  2. Floating 3D glassmorphic market card for stock {{stockTicker}} ({{stockName}}) featuring the complete company name, prominent bold stock price nominal (e.g. \'2,360\'), glowing green positive gain indicator (+5.36%), and a glowing multi-bar candlestick chart.',
          '- Right Flanking Visual Elements:',
          '  1. Modern glass skyscrapers of the Jakarta financial district with office windows glowing at dusk.',
          '  2. 3D glassmorphic corporate emblem card featuring the official circular logo of {{stockName}}, full corporate entity name, and official corporate tagline.',
        ].join('\n'),
        person_only: [
          'Upper-Center Composition & Visual Background (Occupying the upper 60% of the canvas):',
          '- Focal Point: An executive editorial portrait of {{personName}}{{personRole}} with razor-sharp facial detail, wearing a tailored navy suit and elegant executive eyeglasses, confident pose with cinematic cyan rim lighting, positioned in the upper-center area.',
          '- Left Flanking: Elegant glassmorphic policy briefing quote card in quotation marks attributed to {{personName}}.',
          '- Right Flanking: Modern monumental Indonesian financial institution architecture (Kementerian Keuangan / Bank Indonesia) with subtle ambient electric blue light gradients.',
        ].join('\n'),
        stocks_only: [
          'Upper-Center Composition & Visual Background (Occupying the upper 55% of the canvas):',
          '- Focal Point: Dual sleek 3D floating glassmorphic stock ticker cards for {{tickerList}} featuring bold price nominals, glowing green/red percentage change indicators, and glowing 3D candlestick curves with shallow depth of field, positioned symmetrically in the upper half.',
          '- Background & Environment: Modern Indonesia Stock Exchange (IDX) trading floor backdrop with dynamic glowing market trend curves, order book depth data, and illuminated financial network nodes across the upper canvas.',
        ].join('\n'),
        macro_general: [
          'Upper-Center Composition & Visual Background (Occupying the upper 55% of the canvas):',
          '- Focal Point: Monumental Indonesian monetary and financial architecture (Bank Indonesia / Indonesia Stock Exchange) centered in the upper composition, integrated with glowing 3D holographic economic data pillars and electric market trend curves.',
          '- Data Visualization: Dynamic national GDP / IHSG market flow streams, banking data networks, and illuminated financial exchange graphs arranged symmetrically across the upper half.',
        ].join('\n'),
      },
    });

    const captionConfig = JSON.stringify({
      forbidden_words: [
        'pasti naik',
        'pasti turun',
        'pasti cuan',
        'auto cuan',
        'wajib beli',
        'wajib jual',
        'auto profit',
        'jamin untung',
        'guaranteed profit',
        'stockwise',
      ],
      default_hashtags: '#sovstock #SahamIndonesia #IHSG #Investasi #PasarModal #EkonomiIndonesia',
      disclaimer: 'Disclaimer: Informasi ini disajikan murni untuk tujuan edukasi dan berita pasar modal, bukan merupakan ajakan membeli atau menjual efek tertentu. Keputusan investasi sepenuhnya berada di tangan investor.',
      brand_tag: '#sovstock',
    });

    await queryInterface.bulkInsert('Prompts', [
      {
        nicheId: 1,
        type: 'entity_extraction',
        name: 'Indonesian Financial News Entity Extraction',
        systemPrompt: extractionSystemPrompt,
        userPromptTemplate: 'Title: {{title}}\nSource: {{source}}\nURL: {{url}}\nContent:\n{{content}}',
        config: extractionConfig,
        version: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        nicheId: 1,
        type: 'visual_image',
        name: 'Bloomberg/FT Editorial Poster Visual Template',
        systemPrompt: visualSystemPrompt,
        userPromptTemplate: null,
        config: visualConfig,
        version: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        nicheId: 1,
        type: 'caption_template',
        name: 'Instagram Editorial Caption Template',
        systemPrompt: captionSystemPrompt,
        userPromptTemplate: null,
        config: captionConfig,
        version: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('Prompts', { nicheId: 1 }, {});
    await queryInterface.bulkDelete('Niches', { id: 1 }, {});
  },
};
