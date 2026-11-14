const crypto = require('crypto');

/**
 * Universal Article Schema adhering to institutional financial news contracts.
 */
class UniversalArticleSchema {
  constructor(data = {}) {
    const originalUrl = data.original_url || '';
    const canonicalUrl = data.canonical_url || originalUrl;

    this.article_id = data.article_id || UniversalArticleSchema.generateId(canonicalUrl || originalUrl);
    this.source_name = data.source_name || UniversalArticleSchema.extractSourceName(canonicalUrl || originalUrl);
    this.source_domain = data.source_domain || UniversalArticleSchema.extractDomain(canonicalUrl || originalUrl);
    this.source_type = data.source_type || 'generic_web'; // 'official_api' | 'rss' | 'financial_media' | 'official_exchange' | 'generic_web'
    this.original_url = originalUrl;
    this.canonical_url = canonicalUrl || null;
    this.title = (data.title || '').trim();
    this.subtitle = data.subtitle ? data.subtitle.trim() : null;
    this.description = data.description ? data.description.trim() : null;
    this.author = data.author ? data.author.trim() : null;
    this.article_content = (data.article_content || '').trim();
    this.images = Array.isArray(data.images) ? data.images : [];
    this.language = data.language || 'id';
    this.published_at = data.published_at || null;
    this.updated_at = data.updated_at || null;
    this.event_at = data.event_at || null;
    this.first_seen_at = data.first_seen_at || new Date().toISOString();
    this.scraped_at = data.scraped_at || new Date().toISOString();
    this.companies = Array.isArray(data.companies) ? data.companies : [];
    this.stock_tickers = Array.isArray(data.stock_tickers) ? data.stock_tickers : [];
    this.people = Array.isArray(data.people) ? data.people : [];
    this.sectors = Array.isArray(data.sectors) ? data.sectors : [];
    this.extraction_method = data.extraction_method || 'dom_fallback';
    this.extraction_confidence = typeof data.extraction_confidence === 'number' ? data.extraction_confidence : 0.0;
    this.extraction_status = data.extraction_status || 'success'; // 'success' | 'partial' | 'failed' | 'paywall_blocked'
    this.extraction_warnings = Array.isArray(data.extraction_warnings) ? data.extraction_warnings : [];
  }

  static generateId(url) {
    if (!url) return crypto.randomBytes(16).toString('hex');
    return crypto.createHash('sha256').update(String(url).trim().toLowerCase()).digest('hex');
  }

  static extractDomain(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return '';
    }
  }

  static extractSourceName(url) {
    const domain = UniversalArticleSchema.extractDomain(url);
    if (!domain) return 'Unknown';
    if (domain.includes('cnbcindonesia.com')) return 'CNBC Indonesia';
    if (domain.includes('kontan.co.id')) return 'Kontan';
    if (domain.includes('bisnis.com')) return 'Bisnis.com';
    if (domain.includes('idx.co.id')) return 'Bursa Efek Indonesia (IDX)';
    if (domain.includes('invezgo.com')) return 'Invezgo';
    if (domain.includes('bloombergtechnoz.com')) return 'Bloomberg Technoz';
    if (domain.includes('investor.id')) return 'Investor Daily';
    if (domain.includes('kompas.com')) return 'Kompas.com';
    if (domain.includes('detik.com')) return 'Detik';
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  /**
   * Backward-compatibility adapter for legacy services (pipelineService, imageGenerator, etc).
   */
  toLegacyArticle() {
    return {
      source: this.source_name,
      url: this.canonical_url || this.original_url,
      title: this.title,
      text: this.article_content,
      ogImage: this.images.length > 0 ? (this.images[0].url || null) : null,
    };
  }

  toJSON() {
    return {
      article_id: this.article_id,
      source_name: this.source_name,
      source_domain: this.source_domain,
      source_type: this.source_type,
      original_url: this.original_url,
      canonical_url: this.canonical_url,
      title: this.title,
      subtitle: this.subtitle,
      description: this.description,
      author: this.author,
      article_content: this.article_content,
      images: this.images,
      language: this.language,
      published_at: this.published_at,
      updated_at: this.updated_at,
      event_at: this.event_at,
      first_seen_at: this.first_seen_at,
      scraped_at: this.scraped_at,
      companies: this.companies,
      stock_tickers: this.stock_tickers,
      people: this.people,
      sectors: this.sectors,
      extraction_method: this.extraction_method,
      extraction_confidence: this.extraction_confidence,
      extraction_status: this.extraction_status,
      extraction_warnings: this.extraction_warnings,
    };
  }
}

module.exports = UniversalArticleSchema;
