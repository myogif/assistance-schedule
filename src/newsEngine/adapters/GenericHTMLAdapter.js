/* global document */
/* eslint-disable global-require */
const BaseSourceAdapter = require('./BaseSourceAdapter');
const UniversalArticleSchema = require('../schema/UniversalArticleSchema');

/**
 * Universal Generic HTML Adapter executing the 8-level priority cascade.
 */
class GenericHTMLAdapter extends BaseSourceAdapter {
  constructor() {
    super('GenericHTMLAdapter', 'generic_web');
  }

  matches() {
    return true; // Fallback matches any web URL
  }

  /**
   * Helper to parse OpenGraph, Twitter and standard meta tags from HTML
   */
  static extractMeta(html = '') {
    const meta = {};
    const metaTagRegex = /<meta\s+([^>]+)>/gi;
    let match = metaTagRegex.exec(html);
    while (match !== null) {
      const attrs = match[1];
      const nameMatch = attrs.match(/(?:name|property|itemprop)=["']([^"']+)["']/i);
      const contentMatch = attrs.match(/content=["']([^"']*)["']/i);
      if (nameMatch && contentMatch) {
        meta[nameMatch[1].toLowerCase()] = BaseSourceAdapter.decodeHtmlEntities(contentMatch[1]);
      }
      match = metaTagRegex.exec(html);
    }

    // Also look for canonical link
    const canonicalMatch = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    if (canonicalMatch) {
      [, meta.canonical] = canonicalMatch;
    }

    // Title tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      meta['html:title'] = BaseSourceAdapter.decodeHtmlEntities(titleMatch[1]);
    }

    return meta;
  }

  /**
   * Helper to parse JSON-LD from HTML
   */
  static extractJsonLd(html = '') {
    const jsonLdRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match = jsonLdRegex.exec(html);
    const candidates = [];

    while (match !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
        items.forEach((item) => {
          const type = String(item['@type'] || '');
          if (/NewsArticle|Article|BlogPosting|ReportageNewsArticle/i.test(type)) {
            candidates.push(item);
          }
        });
      } catch {
        // Ignore JSON-LD parse errors
      }
      match = jsonLdRegex.exec(html);
    }

    return candidates[0] || null;
  }

  /**
   * Checks for paywall markers
   */
  static detectPaywall(html = '', text = '') {
    const paywallMarkers = [
      /class=["'][^"']*(?:paywall|premium-content|restricted-content)[^"']*["']/i,
      /konten khusus pelanggan/i,
      /berlangganan untuk membaca/i,
      /artikel ini khusus pelanggan/i,
      /subscribe to read full article/i,
      /metered-paywall/i,
    ];
    return paywallMarkers.some((p) => p.test(html) || p.test(text));
  }

  /**
   * Heuristic Text Density extraction (Trafilatura inspired)
   */
  static extractByTextDensity(html = '') {
    // Strip headers, nav, script, style, footer
    const cleaned = html
      .replace(/<(header|footer|nav|aside|script|style|svg|noscript)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '');

    // Extract blocks (<article>, <section>, <div>)
    const blockRegex = /<(article|section|div)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let bestBlock = '';
    let maxDensityScore = 0;
    let match = blockRegex.exec(cleaned);

    while (match !== null) {
      const blockHtml = match[2];
      const text = BaseSourceAdapter.stripHtmlTags(blockHtml);
      if (text.length >= 100) {
        // Link density: count characters inside <a> tags vs total text
        const linkMatches = blockHtml.match(/<a\b[^>]*>([\s\S]*?)<\/a>/gi) || [];
        const linkTextLength = linkMatches.reduce((acc, a) => acc + BaseSourceAdapter.stripHtmlTags(a).length, 0);
        const linkDensity = linkTextLength / Math.max(1, text.length);

        // We want high text length, low link density (< 0.35)
        if (linkDensity < 0.35) {
          const score = text.length * (1 - linkDensity);
          if (score > maxDensityScore) {
            maxDensityScore = score;
            bestBlock = blockHtml;
          }
        }
      }
      match = blockRegex.exec(cleaned);
    }

    if (bestBlock) {
      const pMatches = bestBlock.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
      const paragraphs = pMatches.map((p) => BaseSourceAdapter.stripHtmlTags(p));
      const content = BaseSourceAdapter.cleanParagraphs(paragraphs);
      if (content.length > 100) return content;
    }

    return null;
  }

  /**
   * Semantic Readability extraction
   */
  static extractByReadability(html = '') {
    const divClassPattern = '(?:article-content|detail-text|read__content|post-content|entry-content|content-detail)';
    const containerRegexes = [
      /<article\b[^>]*>([\s\S]*?)<\/article>/i,
      /<main\b[^>]*>([\s\S]*?)<\/main>/i,
      new RegExp(`<div\\b[^>]*(?:class|id)=["'][^"']*${divClassPattern}[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i'),
    ];

    for (let i = 0; i < containerRegexes.length; i += 1) {
      const reg = containerRegexes[i];
      const match = html.match(reg);
      if (match) {
        const pMatches = match[1].match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
        const paragraphs = pMatches.map((p) => BaseSourceAdapter.stripHtmlTags(p));
        const content = BaseSourceAdapter.cleanParagraphs(paragraphs);
        if (content.length > 80) return content;
      }
    }
    return null;
  }

  /**
   * DOM fallback: collects all <p> tags with length > 25
   */
  static extractByDomFallback(html = '') {
    const pMatches = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
    const paragraphs = pMatches.map((p) => BaseSourceAdapter.stripHtmlTags(p));
    return BaseSourceAdapter.cleanParagraphs(paragraphs);
  }

  /**
   * Main extract method executing 8-level priority cascade.
   */
  async extract(input, options = {}) {
    let url = '';
    let rawHtml = '';

    if (typeof input === 'string') {
      if (/^https?:\/\//i.test(input)) {
        url = input;
      } else {
        rawHtml = input;
      }
    } else if (input && typeof input === 'object') {
      url = input.url || '';
      rawHtml = input.html || input.body || '';
    }

    const warnings = [];
    const domain = UniversalArticleSchema.extractDomain(url);
    const sourceName = UniversalArticleSchema.extractSourceName(url);

    // Fetch HTML if only URL is given and no rawHtml provided
    if (!rawHtml && url) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        rawHtml = await res.text();
      } catch (err) {
        warnings.push(`Network fetch failed: ${err.message}`);
      }
    }

    if (!rawHtml) {
      return new UniversalArticleSchema({
        original_url: url,
        source_name: sourceName,
        source_domain: domain,
        source_type: 'generic_web',
        title: '',
        article_content: '',
        extraction_method: 'dom_fallback',
        extraction_confidence: 0.0,
        extraction_status: 'failed',
        extraction_warnings: warnings.concat('Empty HTML received'),
      });
    }

    // Step 2: JSON-LD Extraction
    const jsonLd = GenericHTMLAdapter.extractJsonLd(rawHtml);
    const meta = GenericHTMLAdapter.extractMeta(rawHtml);

    let title = '';
    const subtitle = null;
    let description = null;
    let author = null;
    let publishedAt = null;
    let updatedAt = null;
    const images = [];
    let articleContent = '';
    let extractionMethod = 'dom_fallback';
    let extractionConfidence = 0.5;

    // Check Paywall
    if (GenericHTMLAdapter.detectPaywall(rawHtml, articleContent)) {
      warnings.push('Paywall detected on source page');
    }

    // 1 & 2. Try JSON-LD first
    if (jsonLd) {
      title = jsonLd.headline || jsonLd.name || '';
      description = jsonLd.description || null;
      if (jsonLd.author) {
        author = Array.isArray(jsonLd.author)
          ? jsonLd.author.map((a) => a.name || a).join(', ')
          : (jsonLd.author.name || jsonLd.author);
      }
      publishedAt = BaseSourceAdapter.normalizeIsoDate(jsonLd.datePublished);
      updatedAt = BaseSourceAdapter.normalizeIsoDate(jsonLd.dateModified);

      if (jsonLd.image) {
        const imgUrl = typeof jsonLd.image === 'string' ? jsonLd.image : (jsonLd.image.url || (Array.isArray(jsonLd.image) && jsonLd.image[0]));
        if (imgUrl) images.push({ url: imgUrl, is_cover: true });
      }

      if (jsonLd.articleBody) {
        articleContent = BaseSourceAdapter.stripHtmlTags(jsonLd.articleBody).trim();
        extractionMethod = 'json_ld';
        extractionConfidence = 0.95;
      }
    }

    // 3. Open Graph & Twitter meta tags fallback/enrichment
    if (!title) {
      title = meta['og:title'] || meta['twitter:title'] || meta['html:title'] || '';
    }
    if (!description) {
      description = meta['og:description'] || meta.description || meta['twitter:description'] || null;
    }
    if (!author) {
      author = meta['article:author'] || meta.author || meta['twitter:creator'] || null;
    }
    if (!publishedAt) {
      publishedAt = BaseSourceAdapter.normalizeIsoDate(meta['article:published_time'] || meta['date:published'] || meta.pubdate);
    }
    if (!updatedAt) {
      updatedAt = BaseSourceAdapter.normalizeIsoDate(meta['article:modified_time']);
    }
    if (images.length === 0 && (meta['og:image'] || meta['twitter:image'])) {
      images.push({ url: meta['og:image'] || meta['twitter:image'], is_cover: true });
    }

    // 4. Text Density Algorithm if content not yet extracted
    if (!articleContent || articleContent.length < 100) {
      const densityContent = GenericHTMLAdapter.extractByTextDensity(rawHtml);
      if (densityContent && densityContent.length > 100) {
        articleContent = densityContent;
        extractionMethod = 'text_density';
        extractionConfidence = 0.85;
      }
    }

    // 5. Readability extraction
    if (!articleContent || articleContent.length < 100) {
      const readabilityContent = GenericHTMLAdapter.extractByReadability(rawHtml);
      if (readabilityContent && readabilityContent.length > 80) {
        articleContent = readabilityContent;
        extractionMethod = 'readability';
        extractionConfidence = 0.80;
      }
    }

    // 6. DOM fallback
    if (!articleContent || articleContent.length < 100) {
      const domContent = GenericHTMLAdapter.extractByDomFallback(rawHtml);
      if (domContent && domContent.length > 50) {
        articleContent = domContent;
        extractionMethod = 'dom_fallback';
        extractionConfidence = 0.65;
      }
    }

    // 7. Playwright Engine (if static HTML yield is minimal < 100 chars and we have a valid URL)
    const isClientRendered = rawHtml.includes('__NEXT_DATA__') || rawHtml.includes('id="root"') || rawHtml.includes('id="__next"');
    if ((articleContent.length < 100 || isClientRendered) && url && !options.skipPlaywright) {
      try {
        const { chromium } = require('playwright');
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const dynamicContent = await page.evaluate(() => {
          const paras = Array.from(document.querySelectorAll('article p, main p, div p'));
          return paras.map((p) => p.innerText.trim()).filter((t) => t.length > 25).join('\n\n');
        });
        await browser.close();
        if (dynamicContent && dynamicContent.length > articleContent.length) {
          articleContent = dynamicContent;
          extractionMethod = 'playwright';
          extractionConfidence = 0.85;
        }
      } catch (err) {
        warnings.push(`Playwright fallback failed or skipped: ${err.message}`);
      }
    }

    // 8. AI-assisted Structured Extraction (Controlled Fallback)
    if (articleContent.length < 100 && process.env.OPENAI_API_KEY && !options.skipAiFallback) {
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const snippet = BaseSourceAdapter.stripHtmlTags(rawHtml).slice(0, 4000);
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Extract the article title and full article text from this HTML snippet. Output JSON: { "title": string, "text": string }',
            },
            { role: 'user', content: snippet },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        });
        const aiRes = JSON.parse(completion.choices[0].message.content);
        if (aiRes.text && aiRes.text.length > 50) {
          if (!title) title = aiRes.title;
          articleContent = aiRes.text;
          extractionMethod = 'ai_fallback';
          extractionConfidence = 0.75;
        }
      } catch (err) {
        warnings.push(`AI fallback failed: ${err.message}`);
      }
    }

    // Clean title (remove trailing branding like " - CNBC Indonesia" or " | Kontan")
    if (title) {
      title = title.replace(/\s*[-|–—]\s*(?:CNBC Indonesia|Kontan|Bisnis\.com|Kompas\.com|Detikcom|Tempo).*$/i, '').trim();
    }

    // Check status
    let status = 'success';
    if (GenericHTMLAdapter.detectPaywall(rawHtml, articleContent)) {
      status = 'paywall_blocked';
    } else if (!articleContent || articleContent.length < 50) {
      status = 'partial';
      warnings.push('Extracted article content is very brief or incomplete');
    }

    return new UniversalArticleSchema({
      original_url: url,
      canonical_url: meta.canonical || url,
      source_name: sourceName,
      source_domain: domain,
      source_type: 'generic_web',
      title,
      subtitle,
      description,
      author,
      article_content: articleContent,
      images,
      language: 'id',
      published_at: publishedAt,
      updated_at: updatedAt,
      extraction_method: extractionMethod,
      extraction_confidence: extractionConfidence,
      extraction_status: status,
      extraction_warnings: warnings,
    });
  }
}

module.exports = GenericHTMLAdapter;
