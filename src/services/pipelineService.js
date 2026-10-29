const { Niche, PostLog } = require('../models');
const { resolveArticleInput } = require('./scraper');
const { extractArticleEntities } = require('./aiExtractor');
const { generateEditorialImage } = require('./imageGenerator');
const promptService = require('./promptService');
const { publishToInstagram } = require('./zernioPublisher');

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
    onProgress = () => {},
  } = params;

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

    // 2. Extract entities and editorial concepts
    onProgress(2, 4, 'Menganalisis artikel & mengekstrak konsep editorial...');
    const extracted = await extractArticleEntities(article, nicheCode);

    await postLog.update({
      extractedData: extracted,
      status: 'generating_image',
    });

    // 3. Visual Prompt & Image Generation
    let imagePath = null;
    let visualPrompt = '';
    const promptRecord = await promptService.getActivePrompt(nicheCode, 'visual_image');
    visualPrompt = promptService.buildVisualPrompt(promptRecord, extracted);

    if (dryRun) {
      await postLog.update({
        generatedPrompt: visualPrompt,
        status: 'pending',
      });
    } else {
      onProgress(3, 4, 'Menghasilkan poster gambar AI (1080x1350)...');
      const imageResult = await generateEditorialImage(extracted, { nicheCode });
      imagePath = imageResult.imagePath;

      await postLog.update({
        generatedPrompt: visualPrompt,
        imagePath,
        status: 'publishing',
      });
    }

    // 4. Caption building
    const captionPromptRecord = await promptService.getActivePrompt(nicheCode, 'caption_template');
    const finalCaption = promptService.buildCaption(captionPromptRecord, extracted, article.source);

    await postLog.update({ caption: finalCaption });

    // 5. Instagram Publishing via Zernio
    let publishResult = null;
    if (dryRun) {
      await postLog.update({ status: 'pending' });
    } else if (skipPublish) {
      await postLog.update({ status: 'generated' });
    } else {
      onProgress(4, 4, 'Mengunggah & mempublikasikan ke Instagram via Zernio...');
      publishResult = await publishToInstagram({
        imagePath,
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
