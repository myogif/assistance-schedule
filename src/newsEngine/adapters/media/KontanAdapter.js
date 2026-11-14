const BaseSourceAdapter = require('../BaseSourceAdapter');
const GenericHTMLAdapter = require('../GenericHTMLAdapter');
const UniversalArticleSchema = require('../../schema/UniversalArticleSchema');

/**
 * Kontan (kontan.co.id) Media Adapter.
 */
class KontanAdapter extends BaseSourceAdapter {
  constructor() {
    super('KontanAdapter', 'financial_media');
  }

  matches(url = '', domain = '') {
    const d = domain || UniversalArticleSchema.extractDomain(url);
    return d.includes('kontan.co.id');
  }

  async extract(input, options = {}) {
    const generic = new GenericHTMLAdapter();
    const article = await generic.extract(input, options);

    // Kontan specific cleaning:
    let text = article.article_content;
    let { author } = article;

    // Extract Reporter & Editor disclaimer line: "Reporter: ... | Editor: ..."
    const reporterMatch = text.match(/Reporter:\s*([^|]+)\|\s*Editor:\s*([^\n\r]+)/i);
    if (reporterMatch) {
      if (!author) {
        author = `${reporterMatch[1].trim()} (Ed: ${reporterMatch[2].trim()})`;
      }
      text = text.replace(reporterMatch[0], '').trim();
    }

    // Strip leading "KONTAN.CO.ID - JAKARTA." or similar city datelines
    text = text.replace(/^[A-Z0-9.\s]+-\s*(?:JAKARTA\s*[.\-—]\s*)?/i, '').trim();

    // Strip pagination references like "Halaman 1 2 3" or "/detail/"
    text = text.replace(/Halaman\s+[0-9\s]+/gi, '').trim();

    // Clean title from trailing " - Kontan" or " | KONTAN"
    const title = article.title.replace(/\s*[-|]\s*KONTAN.*$/i, '').trim();

    article.source_name = 'Kontan';
    article.source_type = 'financial_media';
    article.title = title;
    article.author = author;
    article.article_content = text;
    article.extraction_confidence = Math.max(article.extraction_confidence, 0.9);

    return article;
  }
}

module.exports = KontanAdapter;
