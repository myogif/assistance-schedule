const GenericHTMLAdapter = require('../adapters/GenericHTMLAdapter');
const RSSAdapter = require('../adapters/RSSAdapter');
const OfficialAPIAdapter = require('../adapters/OfficialAPIAdapter');
const IDXAdapter = require('../adapters/IDXAdapter');
const KontanAdapter = require('../adapters/media/KontanAdapter');
const CNBCIndonesiaAdapter = require('../adapters/media/CNBCIndonesiaAdapter');
const BisnisComAdapter = require('../adapters/media/BisnisComAdapter');
const InvezgoAdapter = require('../adapters/media/InvezgoAdapter');
const UniversalArticleSchema = require('../schema/UniversalArticleSchema');

/**
 * Registry managing adapters in priority order and routing incoming URLs.
 */
class SourceAdapterRegistry {
  constructor() {
    this.genericAdapter = new GenericHTMLAdapter();
    this.adapters = [];

    // 1. Media-specific adapters (highest priority)
    this.register(new KontanAdapter());
    this.register(new CNBCIndonesiaAdapter());
    this.register(new BisnisComAdapter());
    this.register(new InvezgoAdapter());

    // 2. Specialized adapters
    this.register(new IDXAdapter());
    this.register(new RSSAdapter());
    this.register(new OfficialAPIAdapter());
  }

  /**
   * Registers an adapter at the beginning of the list (higher priority).
   * @param {BaseSourceAdapter} adapter
   */
  register(adapter) {
    if (adapter && typeof adapter.matches === 'function') {
      this.adapters.push(adapter);
    }
  }

  /**
   * Resolves the best matching adapter for a given URL or input object.
   * @param {string|Object} input
   * @returns {BaseSourceAdapter}
   */
  resolveAdapter(input) {
    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input && input.url) {
      url = input.url;
    }
    const domain = UniversalArticleSchema.extractDomain(url);

    for (let i = 0; i < this.adapters.length; i += 1) {
      const adapter = this.adapters[i];
      if (adapter.matches(url, domain)) {
        return adapter;
      }
    }

    return this.genericAdapter;
  }

  /**
   * Convenience method to extract an article directly using the resolved adapter.
   * @param {string|Object} input
   * @param {Object} [options]
   * @returns {Promise<UniversalArticleSchema>}
   */
  async extract(input, options = {}) {
    const adapter = this.resolveAdapter(input);
    return adapter.extract(input, options);
  }
}

// Singleton instance
const defaultRegistry = new SourceAdapterRegistry();
defaultRegistry.SourceAdapterRegistry = SourceAdapterRegistry;

module.exports = defaultRegistry;
