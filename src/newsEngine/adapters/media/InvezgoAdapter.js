const BaseSourceAdapter = require('../BaseSourceAdapter');
const GenericHTMLAdapter = require('../GenericHTMLAdapter');
const UniversalArticleSchema = require('../../schema/UniversalArticleSchema');

/**
 * Invezgo (invezgo.com) Media Adapter.
 */
class InvezgoAdapter extends BaseSourceAdapter {
  constructor() {
    super('InvezgoAdapter', 'financial_media');
  }

  matches(url = '', domain = '') {
    const d = domain || UniversalArticleSchema.extractDomain(url);
    return d.includes('invezgo.com');
  }

  async extract(input, options = {}) {
    const generic = new GenericHTMLAdapter();
    const article = await generic.extract(input, options);

    article.source_name = 'Invezgo';
    article.source_type = 'financial_media';
    article.extraction_confidence = Math.max(article.extraction_confidence, 0.95);

    return article;
  }
}

module.exports = InvezgoAdapter;
