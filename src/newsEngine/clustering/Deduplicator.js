const crypto = require('crypto');
const BaseSourceAdapter = require('../adapters/BaseSourceAdapter');

/**
 * Deduplicator checking canonical URL, content hash, headline similarity, and token overlap.
 */
class Deduplicator {
  /**
   * Normalizes text for hashing and tokenization.
   */
  static normalizeText(text = '') {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Computes SHA-256 hash of normalized text.
   */
  static hashText(text = '') {
    const norm = Deduplicator.normalizeText(text);
    return crypto.createHash('sha256').update(norm).digest('hex');
  }

  /**
   * Token Jaccard similarity.
   */
  static jaccardSimilarity(textA = '', textB = '') {
    const tokensA = new Set(Deduplicator.normalizeText(textA).split(' ').filter(Boolean));
    const tokensB = new Set(Deduplicator.normalizeText(textB).split(' ').filter(Boolean));

    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    tokensA.forEach((t) => {
      if (tokensB.has(t)) intersection += 1;
    });

    const union = new Set([...tokensA, ...tokensB]).size;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Checks if an incoming article is a duplicate of any existing articles.
   * @param {UniversalArticleSchema|Object} article
   * @param {Array<UniversalArticleSchema|Object>} existingArticles
   * @returns {{ isDuplicate: boolean, duplicateOf: string|null, matchType: string|null, similarity: number }}
   */
  isDuplicate(article, existingArticles = []) {
    if (!article || !Array.isArray(existingArticles) || existingArticles.length === 0) {
      return {
        isDuplicate: false,
        duplicateOf: null,
        matchType: null,
        similarity: 0,
      };
    }

    const normUrl = BaseSourceAdapter.normalizeUrl(article.canonical_url || article.original_url);
    const contentHash = Deduplicator.hashText(article.article_content);
    const headline = article.title || '';

    for (let i = 0; i < existingArticles.length; i += 1) {
      const existing = existingArticles[i];
      const existingId = existing.article_id || existing.id;

      // 1. Canonical URL match
      const existingUrl = BaseSourceAdapter.normalizeUrl(existing.canonical_url || existing.original_url || existing.url);
      if (normUrl && existingUrl && normUrl === existingUrl) {
        return {
          isDuplicate: true,
          duplicateOf: existingId,
          matchType: 'canonical_url',
          similarity: 1.0,
        };
      }

      // 2. Exact content hash match
      const existingContent = existing.article_content || existing.text || '';
      const existingHash = existing.content_hash || Deduplicator.hashText(existingContent);
      if (contentHash && existingHash && contentHash === existingHash && contentHash.length > 0) {
        return {
          isDuplicate: true,
          duplicateOf: existingId,
          matchType: 'exact_hash',
          similarity: 1.0,
        };
      }

      // 3. Headline similarity (Jaccard >= 0.85)
      const existingTitle = existing.title || '';
      const headSim = Deduplicator.jaccardSimilarity(headline, existingTitle);
      if (headSim >= 0.85) {
        return {
          isDuplicate: true,
          duplicateOf: existingId,
          matchType: 'headline',
          similarity: headSim,
        };
      }

      // 4. Content token overlap (Jaccard >= 0.80)
      if (article.article_content && existingContent && existingContent.length > 100) {
        const bodySim = Deduplicator.jaccardSimilarity(article.article_content, existingContent);
        if (bodySim >= 0.80) {
          return {
            isDuplicate: true,
            duplicateOf: existingId,
            matchType: 'content',
            similarity: bodySim,
          };
        }
      }
    }

    return {
      isDuplicate: false,
      duplicateOf: null,
      matchType: null,
      similarity: 0,
    };
  }
}

module.exports = new Deduplicator();
module.exports.Deduplicator = Deduplicator;
