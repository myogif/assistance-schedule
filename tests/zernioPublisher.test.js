const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  createPost,
  publishToInstagram,
} = require('../src/services/zernioPublisher');

const originalFetch = global.fetch;

test('createPost sends single image when publicUrl is provided', async () => {
  process.env.ZERNIO_API_KEY = 'test_key';
  let requestBody = null;

  global.fetch = async (url, options) => {
    if (url.includes('/posts')) {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          post: {
            _id: 'post_123',
            platforms: [{ platform: 'instagram', status: 'published', platformPostUrl: 'https://instagram.com/p/123' }],
          },
        }),
      };
    }
    return { ok: false, status: 404 };
  };

  const res = await createPost({
    caption: 'Test Single Caption',
    publicUrl: 'https://cdn.example.com/single.png',
    accountId: 'acc_ig_1',
  });

  assert.equal(res.post._id, 'post_123');
  assert.equal(requestBody.content, 'Test Single Caption');
  assert.equal(requestBody.mediaItems.length, 1);
  assert.equal(requestBody.mediaItems[0].url, 'https://cdn.example.com/single.png');
  assert.equal(requestBody.mediaItems[0].type, 'image');

  global.fetch = originalFetch;
});

test('createPost sends carousel mediaItems array when mediaItems is provided', async () => {
  process.env.ZERNIO_API_KEY = 'test_key';
  let requestBody = null;

  global.fetch = async (url, options) => {
    if (url.includes('/posts')) {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          post: {
            _id: 'post_carousel_456',
            platforms: [{ platform: 'instagram', status: 'published', platformPostUrl: 'https://instagram.com/p/carousel456' }],
          },
        }),
      };
    }
    return { ok: false, status: 404 };
  };

  const sampleMediaItems = [
    { type: 'image', url: 'https://cdn.example.com/slide1.png', mimeType: 'image/png' },
    { type: 'image', url: 'https://cdn.example.com/slide2.png', mimeType: 'image/png' },
    { type: 'image', url: 'https://cdn.example.com/slide3.png', mimeType: 'image/png' },
  ];

  const res = await createPost({
    caption: 'Test Carousel Caption',
    mediaItems: sampleMediaItems,
    accountId: 'acc_ig_1',
  });

  assert.equal(res.post._id, 'post_carousel_456');
  assert.equal(requestBody.content, 'Test Carousel Caption');
  assert.equal(requestBody.mediaItems.length, 3);
  assert.equal(requestBody.mediaItems[0].url, 'https://cdn.example.com/slide1.png');
  assert.equal(requestBody.mediaItems[1].url, 'https://cdn.example.com/slide2.png');
  assert.equal(requestBody.mediaItems[2].url, 'https://cdn.example.com/slide3.png');

  global.fetch = originalFetch;
});

test('publishToInstagram handles carousel posting with multiple imagePaths', async () => {
  process.env.ZERNIO_API_KEY = 'test_key';
  process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID = 'acc_test_ig';

  // Create temporary test files
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carousel-test-'));
  const file1 = path.join(tmpDir, 'slide1.png');
  const file2 = path.join(tmpDir, 'slide2.png');
  const file3 = path.join(tmpDir, 'slide3.png');
  fs.writeFileSync(file1, 'fake-img-1');
  fs.writeFileSync(file2, 'fake-img-2');
  fs.writeFileSync(file3, 'fake-img-3');

  const presignedCalls = [];
  const uploadCalls = [];
  let postRequestBody = null;

  global.fetch = async (url, options) => {
    if (url.includes('/media/presign')) {
      const body = JSON.parse(options.body);
      presignedCalls.push(body);
      const idx = presignedCalls.length;
      return {
        ok: true,
        json: async () => ({
          uploadUrl: `https://storage.example.com/upload/${idx}`,
          publicUrl: `https://cdn.example.com/${body.filename}`,
        }),
      };
    }
    if (url.includes('storage.example.com/upload')) {
      uploadCalls.push({ url, options });
      return { ok: true };
    }
    if (url.includes('/posts')) {
      postRequestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          post: {
            _id: 'post_carousel_789',
            platforms: [{ platform: 'instagram', status: 'published', platformPostUrl: 'https://instagram.com/p/carousel789' }],
          },
        }),
      };
    }
    return { ok: false, status: 404, text: async () => 'Not Found' };
  };

  const result = await publishToInstagram({
    imagePaths: [file1, file2, file3],
    caption: 'Market Update Carousel',
  });

  assert.equal(result.success, true);
  assert.equal(result.isCarousel, true);
  assert.equal(result.mediaCount, 3);
  assert.equal(result.platformPostUrl, 'https://instagram.com/p/carousel789');

  // Verify all 3 images were presigned and uploaded
  assert.equal(presignedCalls.length, 3);
  assert.equal(uploadCalls.length, 3);
  assert.equal(postRequestBody.mediaItems.length, 3);
  assert.equal(postRequestBody.mediaItems[0].url, 'https://cdn.example.com/slide1.png');
  assert.equal(postRequestBody.mediaItems[1].url, 'https://cdn.example.com/slide2.png');
  assert.equal(postRequestBody.mediaItems[2].url, 'https://cdn.example.com/slide3.png');

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
  global.fetch = originalFetch;
});

test('publishToInstagram limits carousel to 10 items max', async () => {
  process.env.ZERNIO_API_KEY = 'test_key';
  process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID = 'acc_test_ig';

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carousel-limit-'));
  const files = [];
  for (let i = 1; i <= 12; i += 1) {
    const f = path.join(tmpDir, `slide${i}.png`);
    fs.writeFileSync(f, `fake-img-${i}`);
    files.push(f);
  }

  let postRequestBody = null;
  global.fetch = async (url, options) => {
    if (url.includes('/media/presign')) {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          uploadUrl: `https://storage.example.com/upload/${body.filename}`,
          publicUrl: `https://cdn.example.com/${body.filename}`,
        }),
      };
    }
    if (url.includes('storage.example.com/upload')) {
      return { ok: true };
    }
    if (url.includes('/posts')) {
      postRequestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          post: {
            _id: 'post_carousel_10',
            platforms: [{ platform: 'instagram', status: 'published', platformPostUrl: 'https://instagram.com/p/carousel10' }],
          },
        }),
      };
    }
    return { ok: false, status: 404, text: async () => 'Not Found' };
  };

  const result = await publishToInstagram({
    imagePaths: files,
    caption: '12 Slide Carousel (should cap at 10)',
  });

  assert.equal(result.isCarousel, true);
  assert.equal(result.mediaCount, 10);
  assert.equal(postRequestBody.mediaItems.length, 10);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  global.fetch = originalFetch;
});
