require('dotenv').config();
const readline = require('readline');
const { runPipeline } = require('../src/services/pipelineService');

function printBanner(nicheCode) {
  console.log('');
  console.log('========================================');
  console.log(' ASSISTANCE SCHEDULE — AUTOPOST SERVICE');
  console.log(` Niche: ${nicheCode.toUpperCase()} • Editorial Publisher`);
  console.log('========================================');
  console.log('');
}

function parseCliArgs(argv = process.argv.slice(2)) {
  let dryRun = false;
  let skipPublish = false;
  let url = null;
  let text = null;
  let niche = process.env.ACTIVE_NICHE || 'finance';
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--skip-publish' || arg === '--no-publish') {
      skipPublish = true;
    } else if (arg.startsWith('--url=')) {
      url = arg.slice('--url='.length).trim();
    } else if (arg === '--url' && i + 1 < argv.length) {
      i += 1;
      url = argv[i].trim();
    } else if (arg.startsWith('--text=')) {
      text = arg.slice('--text='.length).trim();
    } else if (arg === '--text' && i + 1 < argv.length) {
      i += 1;
      text = argv[i].trim();
    } else if (arg.startsWith('--niche=')) {
      niche = arg.slice('--niche='.length).trim();
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  return {
    dryRun,
    skipPublish,
    url,
    text,
    niche,
    positional,
  };
}

function askQuestion(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function resolveCliInput(cliOpts) {
  const { url, text, positional = [] } = cliOpts;

  if (url) {
    return { url };
  }

  if (text) {
    return { text };
  }

  const firstPos = positional[0];
  if (firstPos && /^https?:\/\//i.test(firstPos)) {
    return { url: firstPos };
  }

  if (positional.length > 0) {
    return { text: positional.join(' ') };
  }

  if (!process.stdin.isTTY) {
    throw new Error('Tidak ada input berita yang diberikan. Gunakan --url="https://..." atau --text="..."');
  }

  console.log('Pilih metode input berita:');
  console.log('[1] Masukkan URL Berita (Scrape otomatis dari web)');
  console.log('[2] Masukkan Teks Berita Langsung');
  console.log('');

  const choice = await askQuestion('Pilihan [1/2] (default: 1) atau masukkan URL:\n> ');

  if (/^https?:\/\//i.test(choice)) {
    return { url: choice };
  }

  if (choice === '2') {
    const rawText = await askQuestion('\nMasukkan teks berita (atau judul & rangkuman):\n> ');
    if (!rawText || rawText.length < 20) {
      throw new Error('Teks berita terlalu pendek (minimal 20 karakter).');
    }
    return { text: rawText };
  }

  const chosenUrl = await askQuestion('\nMasukkan URL Berita:\n> ');
  if (!/^https?:\/\//i.test(chosenUrl)) {
    throw new Error('URL harus diawali dengan http:// atau https://');
  }

  return { url: chosenUrl };
}

async function main() {
  const cliOpts = parseCliArgs();
  const nicheCode = cliOpts.niche || 'finance';

  printBanner(nicheCode);

  try {
    const input = await resolveCliInput(cliOpts);

    console.log(`[INIT] Memulai pipeline untuk niche: ${nicheCode}`);
    if (cliOpts.dryRun) console.log('[FLAG] Mode Dry-Run aktif (melewati gambar & publikasi)');
    if (cliOpts.skipPublish) console.log('[FLAG] Mode Skip-Publish aktif (gambar digenerate, tidak diposting ke IG)');

    const result = await runPipeline({
      nicheCode,
      input,
      triggeredBy: 'cli',
      dryRun: cliOpts.dryRun,
      skipPublish: cliOpts.skipPublish,
      onProgress: (step, total, desc) => {
        console.log(`[${step}/${total}] ${desc}`);
      },
    });

    console.log('');
    console.log('========================================');
    console.log(' PROSES BERHASIL SELESAI');
    console.log('========================================');
    console.log(`Log ID:      #${result.logId}`);
    console.log(`Niche:       ${result.nicheCode}`);
    console.log(`Kategori:    #${result.extracted?.category || '-'}`);
    console.log(`Headline:    ${result.extracted?.headline || result.article?.title || '-'}`);
    if (result.imagePath) {
      console.log(`Gambar:      ${result.imagePath}`);
    }
    if (result.publishResult?.postId) {
      console.log(`Post ID:     ${result.publishResult.postId}`);
      console.log(`URL Post:    ${result.publishResult.platformPostUrl || '(sedang diproses)'}`);
    }
    console.log(`Status:      ${result.status.toUpperCase()}`);
    console.log('========================================');
    console.log('');
    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('========================================');
    console.error(' [ERROR] PIPELINE GAGAL');
    console.error('========================================');
    console.error(err.message);
    console.error('');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseCliArgs,
  main,
};
