require('dotenv').config();
const promptService = require('../src/services/promptService');

async function syncPrompts() {
  console.log('[sync-prompts] Checking active visual_image prompt...');
  const current = await promptService.getActivePrompt('finance', 'visual_image');
  console.log(`[sync-prompts] Current version in database: ${current.version}`);

  const cfg = typeof current.config === 'string' ? JSON.parse(current.config) : (current.config || {});
  const newModes = {
    ...cfg.composition_modes,
    both: [
      'Upper-Center Composition & Visual Background (Occupying the upper 60% of the canvas):',
      '- Focal Point: A highly realistic, authoritative editorial portrait photo of {{personName}}{{personRole}}, wearing a sharply tailored dark navy business suit, crisp white dress shirt, silk tie, elegant rectangular executive eyeglasses, confident expression at a 3/4 angle with cinematic cyan rim lighting, positioned prominently in the upper-center area.',
      '- Left Flanking Visual Elements:',
      '  1. Elegant glassmorphic executive quote card in quotation marks attributed to {{personName}}.',
      '  2. Floating 3D glassmorphic market card for stock {{stockTicker}} ({{stockName}}) featuring the complete company name, prominent bold stock price nominal Rp {{stockPrice}}, {{gainColor}} gain indicator {{gainIndicator}}, and a glowing multi-bar candlestick chart.',
      '- Right Flanking Visual Elements:',
      '  1. Modern glass skyscrapers of the Jakarta financial district with office windows glowing at dusk.',
      '  2. 3D glassmorphic corporate emblem card featuring the official circular logo of {{stockName}}, full corporate entity name, and official corporate tagline.',
    ].join('\n'),
    stocks_only: [
      'Upper-Center Composition & Visual Background (Occupying the upper 55% of the canvas):',
      '- Focal Point: {{stockCardsDetail}}, positioned symmetrically in the upper half.',
      '- Background & Environment: Modern Indonesia Stock Exchange (IDX) trading floor backdrop with dynamic glowing market trend curves, order book depth data, and illuminated financial network nodes across the upper canvas.',
    ].join('\n'),
  };

  const updated = await promptService.updatePrompt('finance', 'visual_image', {
    config: { ...cfg, composition_modes: newModes },
  });

  console.log(`[sync-prompts] Successfully updated visual_image prompt to version: ${updated.version}`);
  console.log('[sync-prompts] Done.');
  process.exit(0);
}

syncPrompts().catch((err) => {
  console.error('[sync-prompts] Error:', err.message);
  process.exit(1);
});
