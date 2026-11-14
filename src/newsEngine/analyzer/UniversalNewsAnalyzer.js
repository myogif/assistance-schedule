const OpenAI = require('openai');
const sourceReliabilityRegistry = require('../registry/SourceReliabilityRegistry');

/**
 * Universal AI News Analyzer consuming UniversalArticleSchema and producing institutional insights.
 */
class UniversalNewsAnalyzer {
  constructor(apiKey = process.env.OPENAI_API_KEY) {
    this.apiKey = apiKey;
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = process.env.TEXT_MODEL || 'gpt-4o';
  }

  /**
   * Generates a deterministic heuristic fallback when OpenAI API key is unavailable or fails.
   */
  static generateFallbackAnalysis(schema, reliability) {
    const isPrimaryExchange = schema.source_type === 'official_exchange';
    const hasTickers = Array.isArray(schema.stock_tickers) && schema.stock_tickers.length > 0;
    const tickerStr = hasTickers ? schema.stock_tickers.join(', ') : 'IHSG';

    const cleanTitle = (schema.title || 'PERKEMBANGAN PASAR FINANSIAL').toUpperCase().slice(0, 80);
    const summary = [
      `${schema.source_name || 'Sumber'} melaporkan perkembangan terkait ${tickerStr}.`,
      schema.subtitle || schema.description || 'Pelaku pasar mencermati sentimen dan implikasi kinerja keuangan.',
      reliability.requiresPrimaryVerification
        ? 'Klaim memerlukan konfirmasi keterbukaan informasi resmi di BEI/OJK.'
        : 'Informasi bersumber dari kanal kredibel / otoritas bursa.',
    ];

    // Determine format: articles with rich figures or multi-tickers or > 600 chars get carousel
    const isLong = (schema.article_content || '').length > 600;
    const recFormat = (isLong || hasTickers) ? 'carousel' : 'single';

    return {
      editorial_headline: cleanTitle,
      executive_summary: summary,
      market_impact: `Sentimen pasar terhadap sektor ${(schema.sectors && schema.sectors[0]) || 'keuangan'} berpotensi bergerak mengikuti rilis informasi ini.`,
      sentiment: 'NEUTRAL',
      sentiment_score: 0.0,
      importance_score: isPrimaryExchange ? 9 : 7,
      primary_source_check: reliability.requiresPrimaryVerification
        ? 'Perlu verifikasi keterbukaan informasi primer IDX/regulator'
        : 'Terverifikasi sumber primer/media keuangan mapan',
      recommended_format: recFormat,
      carousel_slides: recFormat === 'carousel' ? [
        {
          slide_number: 1,
          chapter_title: 'HEADLINE',
          headline: cleanTitle,
          subtitle: summary[0],
          visual_scene: 'Modern financial newsroom digital screen backdrop.',
        },
        {
          slide_number: 2,
          chapter_title: 'FAKTA UTAMA',
          headline: 'POIN PENTING',
          subtitle: summary[1],
          visual_scene: 'Key metrics floating display with corporate logo.',
        },
        {
          slide_number: 3,
          chapter_title: 'TRANSMISI PASAR',
          headline: 'IMPLIKASI INVESTOR',
          subtitle: summary[2],
          visual_scene: 'Candlestick financial chart with technical indicators.',
        },
        {
          slide_number: 4,
          chapter_title: 'KESIMPULAN',
          headline: 'OUTLOOK KE DEPAN',
          subtitle: 'Pantau pengumuman lanjutan dan reaksi harga pasar.',
          visual_scene: 'Clean modern closing slide with branding watermark.',
        },
      ] : null,
      suggested_caption: `🚨 ${cleanTitle}\n\n${summary.join('\n\n')}\n\nBagaimana pandangan Anda? Simak selengkapnya dan swipe untuk detail lengkap 👉\n\n#Saham #IHSG #Investasi #${tickerStr.replace(/[^A-Z]/g, '')}`,
    };
  }

  /**
   * Analyzes an article strictly from UniversalArticleSchema.
   * @param {UniversalArticleSchema} schema
   * @returns {Promise<Object>} Standardized AI analysis output
   */
  async analyze(schema) {
    if (!schema) {
      throw new Error('UniversalNewsAnalyzer requires a valid UniversalArticleSchema instance');
    }

    const reliability = sourceReliabilityRegistry.getReliability(schema.canonical_url || schema.original_url);

    // If no OpenAI client, immediately return heuristic fallback
    if (!this.openai) {
      return UniversalNewsAnalyzer.generateFallbackAnalysis(schema, reliability);
    }

    const systemPrompt = `You are an elite financial news editor and visual strategist at an institutional investment media house.
Analyze the provided universal article schema. Adhere strictly to the requested JSON schema.
Output language must be formal, authoritative Indonesian (Bahasa Indonesia baku).`;

    const userPayload = {
      title: schema.title,
      source_name: schema.source_name,
      source_type: schema.source_type,
      reliability_tier: reliability.tier,
      requires_primary_verification: reliability.requiresPrimaryVerification,
      published_at: schema.published_at,
      companies: schema.companies,
      stock_tickers: schema.stock_tickers,
      people: schema.people,
      sectors: schema.sectors,
      article_content: (schema.article_content || '').slice(0, 4500),
    };

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Analyze this article and return a JSON object with this exact shape:
{
  "editorial_headline": string (uppercase punchy headline, max 10 words),
  "executive_summary": [string, string, string] (exactly 3 factual bullet points),
  "market_impact": string (market transmission explanation),
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "sentiment_score": number (-1.0 to 1.0),
  "importance_score": integer (1 to 10),
  "primary_source_check": string,
  "recommended_format": "single" | "carousel",
  "carousel_slides": array of 4 slides or null,
  "suggested_caption": string (Instagram-ready caption with swipe hook)
}

Article Schema:
${JSON.stringify(userPayload, null, 2)}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });

      const parsed = JSON.parse(response.choices[0].message.content);
      return parsed;
    } catch (err) {
      console.warn('[UniversalNewsAnalyzer] OpenAI analysis failed, using structured fallback:', err.message);
      return UniversalNewsAnalyzer.generateFallbackAnalysis(schema, reliability);
    }
  }
}

module.exports = UniversalNewsAnalyzer;
