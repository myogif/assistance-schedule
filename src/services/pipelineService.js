const { Niche, PostLog } = require('../models');
const { resolveArticleInput } = require('./scraper');
const aiExtractor = require('./aiExtractor');
const imageGenerator = require('./imageGenerator');
const promptService = require('./promptService');
const zernioPublisher = require('./zernioPublisher');
const { fetchStockPrices } = require('./stockPriceFetcher');

/**
 * Runs the end-to-end autopost pipeline for a given niche and article input.
 *
 * @param {Object} params
 * @param {string} [params.nicheCode='finance'] - Niche code
 * @param {Object|string} params.input - { url?: string, text?: string } or string URL/text
 * @param {string} [params.triggeredBy='cli'] - Trigger source identifier (e.g. '@user' or 'cli')
 * @param {boolean} [params.dryRun=false] - If true, skips image generation and publishing
 * @param {boolean} [params.skipPublish=false] - If true, generates image but skips publishing
 * @param {Function} [params.onProgress] - Optional progress callback: (step, total, message) => void
 * @returns {Promise<Object>} Execution result summary
 */
async function runPipeline(params = {}) {
  const {
    nicheCode = 'finance',
    input,
    triggeredBy = 'cli',
    dryRun = false,
    skipPublish = false,
    imagePaths = null,
    postFormat = null,
    isCarousel: isCarouselFlag = false,
    onProgress = () => {},
  } = params;

  const resolvedFormat = (postFormat || (isCarouselFlag ? 'carousel' : null) || process.env.POST_FORMAT || 'single')
    .trim()
    .toLowerCase();
  const isCarousel = resolvedFormat === 'carousel';
  // 0. Locate niche
  const niche = await Niche.findOne({ where: { code: nicheCode, isActive: true } });
  if (!niche) {
    throw new Error(`Niche "${nicheCode}" not found or inactive`);
  }

  // Create initial log entry
  const postLog = await PostLog.create({
    nicheId: niche.id,
    status: 'pending',
    triggeredBy,
  });

  try {
    // 1. Resolve article input
    onProgress(1, 4, 'Mengambil & memproses artikel...');
    let inputObj = input || {};
    if (typeof input === 'string') {
      const trimmed = input.trim();
      inputObj = /^https?:\/\//i.test(trimmed) ? { url: trimmed } : { text: trimmed };
    }

    const article = await resolveArticleInput(inputObj);

    await postLog.update({
      articleTitle: article.title,
      articleSource: article.source,
      articleUrl: article.url || null,
      articleContent: article.text,
      status: 'extracting',
    });

    let extracted = null;
    let visualPrompt = '';
    let imagePath = null;
    let resolvedImagePaths = Array.isArray(imagePaths) && imagePaths.length > 0 ? imagePaths : null;
    let finalCaption = '';

    if (isCarousel) {
      // ── CAROUSEL STORYTELLING WORKFLOW ───────────────────────────────
      onProgress(2, 4, 'Menganalisis artikel & merangkum alur cerita carousel (storytelling)...');
      extracted = await aiExtractor.extractArticleCarouselStory(article, nicheCode);

      // Live stock price enrichment
      if (extracted.stocks && extracted.stocks.length > 0) {
        const tickerCodes = extracted.stocks.map((s) => s.ticker);
        const priceMap = await fetchStockPrices(tickerCodes);
        extracted.stocks = extracted.stocks.map((s) => ({
          ...s,
          ...(priceMap.has(s.ticker) ? priceMap.get(s.ticker) : {}),
        }));
      }

      await postLog.update({
        extractedData: { ...extracted, isCarousel: true },
        status: 'generating_image',
      });

      if (dryRun) {
        visualPrompt = extracted.slides?.[0]?.visual_scene || '';
        await postLog.update({
          generatedPrompt: visualPrompt,
          status: 'pending',
        });
      } else if (resolvedImagePaths) {
        [imagePath] = resolvedImagePaths;
        visualPrompt = extracted.slides?.[0]?.visual_scene || '';
        await postLog.update({
          generatedPrompt: visualPrompt,
          imagePath,
          status: 'publishing',
        });
      } else {
        const slideTotal = extracted.slides?.length || 4;
        onProgress(3, 4, `Menghasilkan ${slideTotal} slide gambar carousel AI...`);
        const carouselResult = await imageGenerator.generateCarouselImages(extracted, {
          nicheCode,
          onProgress: (cur, tot, msg) => {
            onProgress(3, 4, `[Slide ${cur}/${tot}] ${msg}`);
          },
        });
        imagePath = carouselResult.imagePath;
        resolvedImagePaths = carouselResult.imagePaths;
        visualPrompt = carouselResult.visualPrompt;

        await postLog.update({
          generatedPrompt: visualPrompt,
          imagePath,
          status: 'publishing',
        });
      }

      finalCaption = promptService.buildCarouselCaption(extracted, article.source);
      await postLog.update({ caption: finalCaption });
    } else {
      // ── EXISTING SINGLE IMAGE WORKFLOW (100% UNCHANGED) ──────────────
      onProgress(2, 4, 'Menganalisis artikel & mengekstrak konsep editorial...');
      extracted = await aiExtractor.extractArticleEntities(article, nicheCode);

      // Fetch live stock prices for extracted tickers
      if (extracted.stocks && extracted.stocks.length > 0) {
        const tickerCodes = extracted.stocks.map((s) => s.ticker);
        const priceMap = await fetchStockPrices(tickerCodes);
        extracted.stocks = extracted.stocks.map((s) => ({
          ...s,
          ...(priceMap.has(s.ticker) ? priceMap.get(s.ticker) : {}),
        }));
      }

      await postLog.update({
        extractedData: extracted,
        status: 'generating_image',
      });

      const promptRecord = await promptService.getActivePrompt(nicheCode, 'visual_image');
      visualPrompt = promptService.buildVisualPrompt(promptRecord, extracted);

      if (dryRun) {
        await postLog.update({
          generatedPrompt: visualPrompt,
          status: 'pending',
        });
      } else if (resolvedImagePaths) {
        [imagePath] = resolvedImagePaths;
        await postLog.update({
          generatedPrompt: visualPrompt,
          imagePath,
          status: 'publishing',
        });
      } else {
        onProgress(3, 4, 'Menghasilkan poster gambar AI (1080x1350)...');
        const imageResult = await imageGenerator.generateEditorialImage(extracted, { nicheCode });
        imagePath = imageResult.imagePath;
        resolvedImagePaths = Array.isArray(imageResult.imagePaths) && imageResult.imagePaths.length > 0
          ? imageResult.imagePaths
          : [imagePath];

        await postLog.update({
          generatedPrompt: visualPrompt,
          imagePath,
          status: 'publishing',
        });
      }

      const captionPromptRecord = await promptService.getActivePrompt(nicheCode, 'caption_template');
      finalCaption = promptService.buildCaption(captionPromptRecord, extracted, article.source);
      await postLog.update({ caption: finalCaption });
    }
    // 5. Instagram Publishing via Zernio
    let publishResult = null;
    if (dryRun) {
      await postLog.update({ status: 'pending' });
    } else if (skipPublish) {
      await postLog.update({ status: 'generated' });
    } else {
      const isMultiSlide = isCarousel || (Array.isArray(resolvedImagePaths) && resolvedImagePaths.length > 1);
      const progressLabel = isMultiSlide
        ? `Mengunggah & mempublikasikan carousel (${resolvedImagePaths?.length || 4} slide) ke Instagram via Zernio...`
        : 'Mengunggah & mempublikasikan ke Instagram via Zernio...';
      onProgress(4, 4, progressLabel);

      publishResult = await zernioPublisher.publishToInstagram({
        imagePath,
        imagePaths: resolvedImagePaths,
        caption: finalCaption,
      });
      await postLog.update({
        zernioPostId: publishResult.postId,
        zernioStatus: publishResult.status,
        zernioPlatformPostUrl: publishResult.platformPostUrl,
        zernioResponse: publishResult.response,
        status: publishResult.success ? 'published' : 'failed',
      });

      if (!publishResult.success) {
        throw new Error(`Publish failed with status: ${publishResult.status}`);
      }
    }

    return {
      logId: postLog.id,
      nicheCode,
      article,
      extracted,
      visualPrompt,
      imagePath,
      imagePaths: resolvedImagePaths || (imagePath ? [imagePath] : []),
      isCarousel: Boolean(publishResult?.isCarousel || (resolvedImagePaths && resolvedImagePaths.length > 1)),
      caption: finalCaption,
      published: Boolean(publishResult?.success),
      publishResult,
      status: postLog.status,
    };
  } catch (err) {
    await postLog.update({
      status: 'failed',
      error: err.message,
    });
    throw err;
  }
}

module.exports = {
  runPipeline,
};
