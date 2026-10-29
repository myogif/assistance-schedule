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
    body: JSON.stringify({ filename }),
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
 * Creates and publishes post on Instagram via Zernio.
 * @param {Object} params - { caption, publicUrl, accountId }
 * @returns {Promise<Object>}
 */
async function createPost({ caption, publicUrl, accountId }) {
  validateConfig();

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
      mediaItems: [
        {
          type: 'image',
          url: publicUrl,
          mimeType: 'image/png',
        },
      ],
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
 * @param {Object} params - { imagePath: string, caption: string }
 * @returns {Promise<{success: boolean, postId: string, status: string, platformPostUrl: string, response: Object}>}
 */
async function publishToInstagram({ imagePath, caption }) {
  validateConfig();

  const accountId = process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID || await fetchInstagramAccountId();
  const filename = path.basename(imagePath);

  // 1. Presign upload
  const presign = await presignUpload(filename);
  const { uploadUrl, publicUrl } = presign;

  // 2. Upload file
  await uploadFile(uploadUrl, imagePath);

  // 3. Create post
  const result = await createPost({ caption, publicUrl, accountId });

  const platform = result.post?.platforms?.[0] || {};
  const isSuccess = platform.status === 'published' || platform.status === 'processing' || platform.status === 'queued';

  return {
    success: isSuccess,
    postId: result.post?._id || '',
    status: platform.status || 'unknown',
    platformPostUrl: platform.platformPostUrl || '',
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
