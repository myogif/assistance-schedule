const BaseSourceAdapter = require('../BaseSourceAdapter');
const GenericHTMLAdapter = require('../GenericHTMLAdapter');
const UniversalArticleSchema = require('../../schema/UniversalArticleSchema');

/**
 * CNBC Indonesia (cnbcindonesia.com) Media Adapter.
 */
class CNBCIndonesiaAdapter extends BaseSourceAdapter {
  constructor() {
    super('CNBCIndonesiaAdapter', 'financial_media');
  }

  matches(url = '', domain = '') {
    const d = domain || UniversalArticleSchema.extractDomain(url);
    return d.includes('cnbcindonesia.com');
  }

  async extract(input, options = {}) {
    let rawHtml = '';
    if (typeof input === 'string' && !/^https?:\/\//i.test(input)) {
      rawHtml = input;
    } else if (input && typeof input === 'object' && input.html) {
      rawHtml = input.html;
    }

    const generic = new GenericHTMLAdapter();
    const article = await generic.extract(input, options);

    // Extract subheadline from <h2 class="sub_judul"> or <h2> in CNBC pages if not present
    let { subtitle } = article;
    if (!subtitle && rawHtml) {
      const h2Regex = /<h2\b[^>]*(?:class=["'][^"']*(?:sub_judul|subjudul|detail__subtitle)[^"']*["'])?[^>]*>([\s\S]*?)<\/h2>/i;
      const h2Match = rawHtml.match(h2Regex);
      if (h2Match) {
        subtitle = BaseSourceAdapter.stripHtmlTags(h2Match[1]).trim();
      }
    }

    let text = article.article_content;

    // Remove leading "Jakarta, CNBC Indonesia -- " or "CNBC Indonesia -"
    text = text.replace(/^[A-Za-z\s]+,\s*CNBC\s+Indonesia\s*[-–—]+\s*/i, '').trim();

    // Strip pagination lines e.g. "Halaman 1 2" or "Simak Berita Selanjutnya"
    text = text.replace(/Halaman\s+[0-9\s]+/gi, '').trim();

    const title = article.title.replace(/\s*[-|]\s*CNBC\s+Indonesia.*$/i, '').trim();

    article.source_name = 'CNBC Indonesia';
    article.source_type = 'financial_media';
    article.title = title;
    article.subtitle = subtitle;
    article.article_content = text;
    article.extraction_confidence = Math.max(article.extraction_confidence, 0.9);

    return article;
  }
}

module.exports = CNBCIndonesiaAdapter;
