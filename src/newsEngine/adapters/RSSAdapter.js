const BaseSourceAdapter = require('./BaseSourceAdapter');
const UniversalArticleSchema = require('../schema/UniversalArticleSchema');

/**
 * RSS 2.0 and Atom Feed Adapter.
 */
class RSSAdapter extends BaseSourceAdapter {
  constructor() {
    super('RSSAdapter', 'rss');
  }

  matches(url = '') {
    return (
      url.endsWith('.rss')
      || url.endsWith('.xml')
      || url.includes('/rss')
      || url.includes('/feed')
      || url.includes('feed=rss')
    );
  }

  /**
   * Helper to parse XML items/entries without external parser dependencies.
   */
  static parseFeedXml(xmlStr = '') {
    const items = [];
    // Match <item> (RSS) or <entry> (Atom)
    const itemRegex = /<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
    let match = itemRegex.exec(xmlStr);

    while (match !== null) {
      const block = match[1];

      // Title
      const titleRegex = /<title\b[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i;
      const titleMatch = block.match(titleRegex);
      const title = BaseSourceAdapter.stripHtmlTags(titleMatch ? (titleMatch[1] || titleMatch[2]) : '');

      // Link
      let link = '';
      const linkMatch = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>|<link\b[^>]*>([\s\S]*?)<\/link>/i);
      if (linkMatch) {
        link = (linkMatch[1] || linkMatch[2] || '').trim();
      }

      // Description / summary
      const descRegex = /<(?:description|summary)\b[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:description|summary)>/i;
      const descMatch = block.match(descRegex);
      const description = BaseSourceAdapter.stripHtmlTags(descMatch ? (descMatch[1] || descMatch[2]) : '');

      // Content (content:encoded or content)
      const contentRegex = /<(?:content:encoded|content)\b[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:content:encoded|content)>/i;
      const contentMatch = block.match(contentRegex);
      const rawContent = contentMatch ? (contentMatch[1] || contentMatch[2]) : description;
      const content = BaseSourceAdapter.stripHtmlTags(rawContent);

      // PubDate / published / updated
      const dateRegex = /<(?:pubDate|published|updated|dc:date)\b[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i;
      const dateMatch = block.match(dateRegex);
      const pubDate = dateMatch ? BaseSourceAdapter.normalizeIsoDate(dateMatch[1].trim()) : null;

      // Author / dc:creator
      // eslint-disable-next-line max-len
      const authorRegex = /<(?:author|dc:creator)\b[^>]*>(?:<name>([\s\S]*?)<\/name>|<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:author|dc:creator)>/i;
      const authorMatch = block.match(authorRegex);
      let author = null;
      if (authorMatch) {
        author = BaseSourceAdapter.stripHtmlTags(authorMatch[1] || authorMatch[2] || authorMatch[3]);
      }

      // Enclosure / Media image
      const imageMatch = block.match(/<(?:enclosure|media:content)\b[^>]*url=["']([^"']+)["'][^>]*\/?>/i);
      const imageUrl = imageMatch ? imageMatch[1] : null;

      items.push({
        title,
        link,
        description,
        content,
        pubDate,
        author,
        imageUrl,
      });
      match = itemRegex.exec(xmlStr);
    }

    return items;
  }

  async extract(input) {
    let xml = '';
    let feedUrl = '';

    if (typeof input === 'string') {
      if (/^https?:\/\//i.test(input)) {
        feedUrl = input;
      } else {
        xml = input;
      }
    } else if (input && typeof input === 'object') {
      feedUrl = input.url || '';
      xml = input.xml || input.body || '';
    }

    if (!xml && feedUrl) {
      const res = await fetch(feedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/rss+xml,application/atom+xml,text/xml,application/xml',
        },
      });
      xml = await res.text();
    }

    const items = RSSAdapter.parseFeedXml(xml);
    const firstItem = items[0] || {};
    const itemUrl = firstItem.link || feedUrl;
    const domain = UniversalArticleSchema.extractDomain(itemUrl);
    const sourceName = UniversalArticleSchema.extractSourceName(itemUrl);

    return new UniversalArticleSchema({
      original_url: itemUrl,
      canonical_url: itemUrl,
      source_name: sourceName,
      source_domain: domain,
      source_type: 'rss',
      title: firstItem.title || '',
      description: firstItem.description || null,
      author: firstItem.author || null,
      article_content: firstItem.content || firstItem.description || '',
      images: firstItem.imageUrl ? [{ url: firstItem.imageUrl, is_cover: true }] : [],
      language: 'id',
      published_at: firstItem.pubDate,
      extraction_method: 'rss',
      extraction_confidence: 0.95,
      extraction_status: items.length > 0 ? 'success' : 'failed',
      extraction_warnings: items.length === 0 ? ['No RSS items parsed from input'] : [],
    });
  }
}

module.exports = RSSAdapter;
