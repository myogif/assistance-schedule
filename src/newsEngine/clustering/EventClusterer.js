const crypto = require('crypto');

const EVENT_KEYWORDS = [
  { category: 'DIVIDEN', regex: /\b(?:dividen|cum\s+date|ex\s+date|pay\s+date)\b/i },
  { category: 'LAPORAN KEUANGAN', regex: /\b(?:laba\s+bersih|kinerja|pendapatan|rugi|ebitda|kuartal|semester)\b/i },
  { category: 'AKUISISI & MERGER', regex: /\b(?:akuisisi|merger|takeover|divestasi|m&a)\b/i },
  { category: 'CORPORATE ACTION', regex: /\b(?:rights\s+issue|private\s+placement|stock\s+split|buyback)\b/i },
  { category: 'IPO', regex: /\b(?:ipo|listing|pencatatan\s+perdana|go\s+public)\b/i },
  { category: 'KEBIJAKAN MONETER', regex: /\b(?:suku\s+bunga|bi-rate|bi\s+rate|fed\s+rate|inflasi)\b/i },
  { category: 'MARKET MOVEMENT', regex: /\b(?:ihsg|rebound|anjlok|rally|bearish|bullish)\b/i },
];

class EventClusterer {
  constructor() {
    this.clusters = new Map(); // cluster_id -> cluster
  }

  static detectEventCategory(text = '', title = '') {
    const combined = `${title} ${text}`;
    for (let i = 0; i < EVENT_KEYWORDS.length; i += 1) {
      const item = EVENT_KEYWORDS[i];
      if (item.regex.test(combined)) {
        return item.category;
      }
    }
    return 'UMUM';
  }

  static extractPrimaryEntity(article) {
    if (Array.isArray(article.stock_tickers) && article.stock_tickers.length > 0) {
      return article.stock_tickers[0];
    }
    if (Array.isArray(article.companies) && article.companies.length > 0) {
      const primary = article.companies.find((c) => c.is_primary) || article.companies[0];
      return primary.ticker || primary.name;
    }
    if (Array.isArray(article.people) && article.people.length > 0) {
      return article.people[0].name;
    }
    return 'MARKET';
  }

  /**
   * Assigns an article to an existing cluster or creates a new cluster.
   * @param {UniversalArticleSchema|Object} article
   * @param {Array<Object>} [existingClusters=[]]
   * @returns {{ cluster: Object, isNewCluster: boolean, isUpdate: boolean }}
   */
  clusterArticle(article, existingClusters = []) {
    const primaryEntity = EventClusterer.extractPrimaryEntity(article);
    const category = EventClusterer.detectEventCategory(article.article_content, article.title);
    const articleTime = article.published_at ? new Date(article.published_at).getTime() : Date.now();
    const WINDOW_MS = 36 * 60 * 60 * 1000; // 36 hours sliding window

    const allClusters = existingClusters.length > 0 ? existingClusters : Array.from(this.clusters.values());

    for (let i = 0; i < allClusters.length; i += 1) {
      const cluster = allClusters[i];
      const isEntityMatch = cluster.primary_entity === primaryEntity;
      const isCategoryMatch = cluster.event_category === category;
      const firstArticleTime = (cluster.articles[0] && cluster.articles[0].published_at)
        ? new Date(cluster.articles[0].published_at).getTime()
        : new Date(cluster.created_at || cluster.createdAt || Date.now()).getTime();
      const isWithinWindow = Math.abs(articleTime - firstArticleTime) <= WINDOW_MS;
      if (isEntityMatch && (isCategoryMatch || category !== 'UMUM') && isWithinWindow) {
        // Match found! Check if this is a material update
        const isUpdate = cluster.articles.length > 0;
        const entry = {
          article_id: article.article_id,
          source_name: article.source_name,
          url: article.canonical_url || article.original_url,
          published_at: article.published_at,
          is_update: isUpdate,
        };

        // Avoid adding exact duplicate article id to cluster
        if (!cluster.articles.some((a) => a.article_id === article.article_id)) {
          cluster.articles.push(entry);
          cluster.updated_at = new Date().toISOString();
        }

        return {
          cluster,
          isNewCluster: false,
          isUpdate,
        };
      }
    }

    // No matching cluster; create new
    const clusterId = `cluster_${crypto.randomBytes(8).toString('hex')}`;
    const newCluster = {
      cluster_id: clusterId,
      topic_title: article.title || `${primaryEntity} - ${category}`,
      primary_entity: primaryEntity,
      event_category: category,
      articles: [
        {
          article_id: article.article_id,
          source_name: article.source_name,
          url: article.canonical_url || article.original_url,
          published_at: article.published_at,
          is_update: false,
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.clusters.set(clusterId, newCluster);

    return {
      cluster: newCluster,
      isNewCluster: true,
      isUpdate: false,
    };
  }

  getClusters() {
    return Array.from(this.clusters.values());
  }
}

module.exports = new EventClusterer();
module.exports.EventClusterer = EventClusterer;
