const BaseSourceAdapter = require('../BaseSourceAdapter');
const GenericHTMLAdapter = require('../GenericHTMLAdapter');
const UniversalArticleSchema = require('../../schema/UniversalArticleSchema');

/**
 * Bisnis Indonesia (bisnis.com) Media Adapter.
 */
class BisnisComAdapter extends BaseSourceAdapter {
  constructor() {
    super('BisnisComAdapter', 'financial_media');
  }

  matches(url = '', domain = '') {
    const d = domain || UniversalArticleSchema.extractDomain(url);
    return d.includes('bisnis.com');
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

    let { author } = article;
    if (!author && rawHtml) {
      // Bisnis.com author byline pattern: <span class="author-name">...</span>
      // eslint-disable-next-line max-len
      const authorRegex = /<(?:span|div|a)\b[^>]*(?:class=["'][^"']*(?:author|byline|penulis)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:span|div|a)>/i;
      const authorMatch = rawHtml.match(authorRegex);
      if (authorMatch) {
        author = BaseSourceAdapter.stripHtmlTags(authorMatch[1]).trim();
      }
    }

    let text = article.article_content;

    // Remove leading "Bisnis.com, JAKARTA — " or "Bisnis, JAKARTA -"
    text = text.replace(/^Bisnis(?:\.com)?,\s*[A-Z\s]+[—–-]+\s*/i, '').trim();

    // Strip pagination lines
    text = text.replace(/Halaman\s+[0-9\s]+/gi, '').trim();

    const title = article.title.replace(/\s*[-|]\s*Bisnis\.com.*$/i, '').trim();

    article.source_name = 'Bisnis.com';
    article.source_type = 'financial_media';
    article.title = title;
    article.author = author;
    article.article_content = text;
    article.extraction_confidence = Math.max(article.extraction_confidence, 0.9);

    return article;
  }
}

module.exports = BisnisComAdapter;
