/**
 * Base Source Adapter defining the contract for all news source adapters.
 */
class BaseSourceAdapter {
  constructor(name = 'BaseSourceAdapter', sourceType = 'generic_web') {
    this.name = name;
    this.sourceType = sourceType;
  }

  /**
   * Determines if this adapter handles the given URL/domain.
   * @returns {boolean}
   */
  matches() {
    return false;
  }

  /**
   * Extracts news content and metadata into UniversalArticleSchema.
   * @returns {Promise<UniversalArticleSchema>}
   */
  async extract() {
    throw new Error(`extract() must be implemented by ${this.name}`);
  }
  // Helper utility methods

  static decodeHtmlEntities(str = '') {
    if (!str) return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
  }

  static stripHtmlTags(html = '') {
    if (!html) return '';
    return BaseSourceAdapter.decodeHtmlEntities(
      html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<\/?[^>]+(>|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }

  static normalizeIsoDate(dateStr) {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch {
      // Ignore parse failure
    }
    return null;
  }

  static cleanParagraphs(paragraphs = []) {
    const ignorePatterns = [
      /baca juga/i,
      /simak selengkapnya/i,
      /halaman selanjutnya/i,
      /advertisement/i,
      /ikuti saluran/i,
      /klik disini/i,
      /sumber:/i,
      /copyright/i,
      /hak cipta/i,
      /all rights reserved/i,
    ];

    return paragraphs
      .map((p) => BaseSourceAdapter.stripHtmlTags(p).trim())
      .filter((p) => p.length > 25 && !ignorePatterns.some((pattern) => pattern.test(p)))
      .join('\n\n');
  }

  static normalizeUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      const searchParams = new URLSearchParams(u.search);
      // Remove tracking params
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid'].forEach((param) => {
        searchParams.delete(param);
      });
      u.search = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return u.toString().replace(/\/+$/, '');
    } catch {
      return String(url).replace(/\/+$/, '');
    }
  }
}

module.exports = BaseSourceAdapter;
