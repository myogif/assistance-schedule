const BaseSourceAdapter = require('./BaseSourceAdapter');
const UniversalArticleSchema = require('../schema/UniversalArticleSchema');

/**
 * Official API Adapter handling structured JSON payloads.
 */
class OfficialAPIAdapter extends BaseSourceAdapter {
  constructor() {
    super('OfficialAPIAdapter', 'official_api');
  }

  matches(url = '') {
    return (
      url.endsWith('.json')
      || url.includes('/api/')
      || url.includes('format=json')
    );
  }

  async extract(input) {
    let payload = null;
    let url = '';

    if (typeof input === 'string') {
      if (/^https?:\/\//i.test(input)) {
        url = input;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json',
          },
        });
        payload = await res.json();
      } else {
        try {
          payload = JSON.parse(input);
        } catch {
          payload = {};
        }
      }
    } else if (input && typeof input === 'object') {
      url = input.url || '';
      payload = input.payload || input.data || input;
    }

    const domain = UniversalArticleSchema.extractDomain(url);
    const sourceName = UniversalArticleSchema.extractSourceName(url);

    // Map common structured keys
    const title = payload.title || payload.headline || payload.subject || '';
    const text = payload.text || payload.content || payload.article_content || payload.body || '';
    const description = payload.description || payload.summary || null;
    const author = payload.author || payload.creator || null;
    const publishedAt = BaseSourceAdapter.normalizeIsoDate(
      payload.published_at || payload.publishedAt || payload.date || payload.created_at,
    );
    let images = [];
    if (Array.isArray(payload.images)) {
      images = payload.images;
    } else if (payload.image) {
      images = [{ url: payload.image, is_cover: true }];
    }

    return new UniversalArticleSchema({
      original_url: url,
      canonical_url: payload.canonical_url || url,
      source_name: payload.source_name || sourceName,
      source_domain: domain,
      source_type: 'official_api',
      title,
      description,
      author,
      article_content: typeof text === 'string' ? text : JSON.stringify(text),
      images,
      language: payload.language || 'id',
      published_at: publishedAt,
      extraction_method: 'official_api',
      extraction_confidence: 1.0,
      extraction_status: 'success',
      extraction_warnings: [],
    });
  }
}

module.exports = OfficialAPIAdapter;
