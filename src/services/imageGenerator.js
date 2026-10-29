const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const OpenAI = require('openai');
const promptService = require('./promptService');

const IG_WIDTH = 1080;
const IG_HEIGHT = 1350;

/**
 * Resizes image buffer strictly to Instagram 4:5 portrait (1080x1350 PNG).
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function resizeToInstagram(buffer) {
  return sharp(buffer)
    .resize(IG_WIDTH, IG_HEIGHT, { fit: 'fill' })
    .png()
    .toBuffer();
}

/**
 * Generates editorial image using local API endpoint or OpenAI image model fallback.
 * @param {Object} extracted - Extracted entities object
 * @param {Object} options - { nicheCode?: string, outputDir?: string, openaiClient?: OpenAI }
 * @returns {Promise<{imagePath: string, latestImagePath: string, model: string, durationSeconds: number, visualPrompt: string}>}
 */
async function generateEditorialImage(extracted, options = {}) {
  const nicheCode = options.nicheCode || 'finance';
  const promptRecord = await promptService.getActivePrompt(nicheCode, 'visual_image');
  const visualPrompt = promptService.buildVisualPrompt(promptRecord, extracted);

  const localEndpoint = process.env.LOCAL_IMAGE_API_URL || 'http://localhost:20128/v1/images/generations';
  const localApiKey = process.env.LOCAL_IMAGE_API_KEY || 'sk-5e835ab2c467c876-dovups-b2f50d68';
  const localModel = process.env.LOCAL_IMAGE_MODEL || 'ag/gemini-3.1-flash-image';
  const imageSize = process.env.IMAGE_SIZE || promptRecord.config?.size || '1088x1360';

  const startTime = Date.now();
  let usedModel = null;
  let revisedPrompt = null;
  let imageBuffer = null;

  // 1. Try local image API endpoint
  try {
    const localRes = await fetch(localEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localApiKey}`,
      },
      body: JSON.stringify({
        model: localModel,
        prompt: visualPrompt,
        n: 1,
        size: imageSize,
        quality: 'auto',
        background: 'auto',
        image_detail: 'high',
        output_format: 'png',
      }),
    });

    if (localRes.ok) {
      const localJson = await localRes.json();
      if (localJson?.data?.[0]?.b64_json) {
        usedModel = localModel;
        imageBuffer = Buffer.from(localJson.data[0].b64_json, 'base64');
        revisedPrompt = localJson.data[0].revised_prompt || null;
      }
    }
  } catch (err) {
    // Local API failed or not reachable, fallback to OpenAI
  }

  // 2. Fallback to candidate OpenAI models if local API did not produce an imageBuffer
  if (!imageBuffer) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey && !options.openaiClient) {
      throw new Error('OPENAI_API_KEY is not configured for image generation');
    }

    const openai = options.openaiClient || new OpenAI({ apiKey });
    const candidateModels = [
      'dall-e-3',
      process.env.IMAGE_MODEL,
      'gpt-image-2.5-sunburst',
      'chatgpt-image-latest',
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

    let responseData = null;
    let lastError = null;

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < candidateModels.length; i += 1) {
      const model = candidateModels[i];
      try {
        console.log(`Attempting generation with model '${model}'...`);
        const response = await openai.images.generate({
          model,
          prompt: visualPrompt,
          n: 1,
          size: imageSize,
        });

        if (response?.data?.[0]) {
          usedModel = model;
          [responseData] = response.data;
          revisedPrompt = responseData.revised_prompt || null;
          console.log(`Success with model: ${model}`);
          break;
        }
      } catch (err) {
        console.warn(`Model '${model}' failed: ${err.message}`);
        lastError = err;
      }
    }
    /* eslint-enable no-await-in-loop */

    if (!responseData) {
      throw new Error(`All image generation models failed. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
    }

    if (responseData.b64_json) {
      imageBuffer = Buffer.from(responseData.b64_json, 'base64');
    } else if (responseData.url) {
      const downloadRes = await fetch(responseData.url);
      if (!downloadRes.ok) {
        throw new Error(`Failed to download generated image: HTTP ${downloadRes.status}`);
      }
      const arrayBuffer = await downloadRes.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    }
  }

  if (!imageBuffer) {
    throw new Error('Image response contains no valid image data');
  }

  // Resize to strict 1080x1350 PNG
  imageBuffer = await resizeToInstagram(imageBuffer);

  const durationSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));

  // Determine output directory
  const baseOutputDir = options.outputDir || path.resolve(process.cwd(), 'output', nicheCode);
  if (!fs.existsSync(baseOutputDir)) {
    fs.mkdirSync(baseOutputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const imageFilename = `editorial-${nicheCode}-${timestamp}.png`;
  const imagePath = path.join(baseOutputDir, imageFilename);
  const latestImagePath = path.join(baseOutputDir, `latest-${nicheCode}.png`);

  fs.writeFileSync(imagePath, imageBuffer);
  fs.copyFileSync(imagePath, latestImagePath);

  return {
    imagePath,
    latestImagePath,
    buffer: imageBuffer,
    model: usedModel,
    durationSeconds,
    revisedPrompt,
    visualPrompt,
  };
}

module.exports = {
  generateEditorialImage,
  resizeToInstagram,
};
