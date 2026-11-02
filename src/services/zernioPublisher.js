const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_URL = 'https://zernio.com/api/v1';

function validateConfig() {
  if (!process.env.ZERNIO_API_KEY) {
    throw new Error('ZERNIO_API_KEY is not configured in environment variables');
  }
}

/**
 * Auto-detects the first Instagram account ID associated with the API key.
 * @returns {Promise<string>}
 */
async function fetchInstagramAccountId() {
  validateConfig();

  const res = await fetch(`${BASE_URL}/accounts?platform=instagram`, {
    headers: { Authorization: `Bearer ${process.env.ZERNIO_API_KEY}` },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to fetch Instagram account (HTTP ${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const accounts = data.accounts || [];

  if (accounts.length === 0) {
    throw new Error('No Instagram accounts found linked to this Zernio API key');
  }

  return accounts[0]._id;
}

/**
 * Requests an S3 presigned upload URL from Zernio.
 * @param {string} filename
 * @returns {Promise<{uploadUrl: string, publicUrl: string}>}
 */
async function presignUpload(filename) {
  validateConfig();

  const res = await fetch(`${BASE_URL}/media/presign`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename, contentType: 'image/png' }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Presign media upload failed (HTTP ${res.status}): ${errorText}`);
  }

  return res.json();
}

/**
 * Uploads local file buffer to the S3 presigned URL.
 * @param {string} uploadUrl
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function uploadFile(uploadUrl, filePath) {
  const buffer = fs.readFileSync(filePath);

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  });

  if (!res.ok) {
    throw new Error(`Direct media upload to storage failed with HTTP ${res.status}`);
  }
}

/**
 * Creates and publishes post on Instagram via Zernio (supports single image & carousel).
 * @param {Object} params - { caption, publicUrl, mediaItems, accountId }
 * @returns {Promise<Object>}
 */
async function createPost({
  caption,
  publicUrl,
  mediaItems,
  accountId,
}) {
  validateConfig();

  let finalMediaItems = [];
  if (Array.isArray(mediaItems) && mediaItems.length > 0) {
    finalMediaItems = mediaItems;
  } else if (publicUrl) {
    finalMediaItems = [
      {
        type: 'image',
        url: publicUrl,
        mimeType: 'image/png',
      },
    ];
  } else {
    throw new Error('At least one media item or publicUrl is required to create a post');
  }

  const idempotencyKey = crypto.createHash('sha256').update(caption).digest('hex');

  const res = await fetch(`${BASE_URL}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      content: caption,
      mediaItems: finalMediaItems,
      platforms: [
        {
          platform: 'instagram',
          accountId,
        },
      ],
      publishNow: true,
    }),
  });

  if (!res.ok) {
    let body;
    try {
      body = await res.json();
    } catch (_) {
      body = await res.text().catch(() => '');
    }

    const msg = typeof body === 'object'
      ? (body.error || body.message || JSON.stringify(body))
      : body;
    throw new Error(`Zernio post creation failed (HTTP ${res.status}): ${msg}`);
  }

  return res.json();
}

/**
 * End-to-end publish flow: presign -> upload -> create post.
 * Supports single image (imagePath) and carousel (imagePaths).
 *
 * @param {Object} params
 * @param {string} [params.imagePath] - Single image path
 * @param {string[]} [params.imagePaths] - Multiple image paths for carousel (up to 10)
 * @param {string} params.caption - Post caption
 * @returns {Promise<{success: boolean, postId: string, status: string, platformPostUrl: string, isCarousel: boolean, mediaCount: number, response: Object}>}
 */
async function publishToInstagram({ imagePath, imagePaths, caption }) {
  validateConfig();

  let paths = [];
  if (Array.isArray(imagePaths) && imagePaths.length > 0) {
    paths = imagePaths.filter(Boolean);
  } else if (imagePath) {
    paths = [imagePath];
  }

  if (paths.length === 0) {
    throw new Error('No image path provided for Instagram publishing');
  }

  if (paths.length > 10) {
    console.warn(`[zernioPublisher] Instagram carousel limit is 10 items. Slicing ${paths.length} down to 10.`);
    paths = paths.slice(0, 10);
  }

  const accountId = process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID || await fetchInstagramAccountId();

  // 1 & 2. Presign & upload all images
  const mediaItems = [];
  for (let i = 0; i < paths.length; i += 1) {
    const currentPath = paths[i];
    const filename = path.basename(currentPath);
    // eslint-disable-next-line no-await-in-loop
    const presign = await presignUpload(filename);
    const { uploadUrl, publicUrl } = presign;
    // eslint-disable-next-line no-await-in-loop
    await uploadFile(uploadUrl, currentPath);

    mediaItems.push({
      type: 'image',
      url: publicUrl,
      mimeType: 'image/png',
    });
  }

  // 3. Create post with mediaItems
  const result = await createPost({ caption, mediaItems, accountId });

  const platform = result.post?.platforms?.[0] || {};
  const isSuccess = platform.status === 'published' || platform.status === 'processing' || platform.status === 'queued';

  return {
    success: isSuccess,
    postId: result.post?._id || '',
    status: platform.status || 'unknown',
    platformPostUrl: platform.platformPostUrl || '',
    isCarousel: mediaItems.length > 1,
    mediaCount: mediaItems.length,
    response: result,
  };
}

module.exports = {
  fetchInstagramAccountId,
  presignUpload,
  uploadFile,
  createPost,
  publishToInstagram,
};
