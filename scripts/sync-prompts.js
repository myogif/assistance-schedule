require('dotenv').config();
const promptService = require('../src/services/promptService');

async function syncPrompts() {
  console.log('[sync-prompts] Checking active visual_image prompt...');
  const current = await promptService.getActivePrompt('finance', 'visual_image');
  console.log(`[sync-prompts] Current version in database: ${current.version}`);

  const cfg = typeof current.config === 'string' ? JSON.parse(current.config) : (current.config || {});
  const newSystemPrompt = [
    'Format: Tall portrait 4:5 editorial poster (1080x1350 portrait format) for Instagram feed. The entire canvas is vertical/portrait orientation — DO NOT generate a square or landscape image.',
    'Style & Aesthetic: Ultra-sharp realistic photojournalistic editorial cover aesthetic, cinematic warm golden amber & dark charcoal (#0B0E14) lighting, high contrast, clean centered typography integration, vibrant bright orange (#FF7A00) and crisp white (#FFFFFF) dual-tone typography, 8k resolution. Natural real-world executive portraits and authentic financial atmosphere, zero floating sci-fi neon or abstract 3D gimmicks.',
    '',
    '{{composition_details}}',
    '',
    'Bottom-Center Typography & Information Structure (Strictly Anchored at Lower-Center / Bottom 45%):',
    "1. Category Tag / Micro-Typography Bar: Centered category badge '— {{category}} —' in clean tracked uppercase sans-serif with subtle flanking labels ('INDONESIA CAPITAL MARKETS' on left, 'MARKETS & INSIGHTS' on right), positioned directly above the headline at lower-center.",
    '2. Centered Dual-Tone Headline Typography: All headline lines are strictly center-aligned across the poster width, located at the bottom-center of the poster. Massive bold condensed uppercase typography reading "{{headline}}". Action keywords and prominent financial numbers are styled in vibrant bright orange (#FF7A00), while entity and person names are in crisp bold white (#FFFFFF).',
    '3. Centered Subtitle: Set directly below the headline, perfectly center-aligned across the horizontal axis: "{{subtitle}}".',
    '4. Visual Hierarchy Invariant: The entire text block (category badge, massive headline, and subtitle) is strictly anchored at the lower-center / bottom 45% of the poster, serving as the visual anchor and foundation, leaving the upper 55% clean, open, and dramatic for the authentic visual subject, portrait, and warm lighting atmosphere.',
    '',
    'Footer & Branding Elements (Anchored at the very bottom edge):',
    '- Bottom Metrics Bar: Three horizontal icon columns: [Chart icon] STRATEGIC INVESTMENTS | [Leaf icon] SUSTAINABLE GROWTH | [People icon] A STRONGER INDONESIA.',
    "- Official Footer Branding: Centered elegant dark navy shield emblem logo with gold crown and gold letter 'S' watermark, bold branding text 'SOVSTOCK', and tagline 'MARKET INSIGHTS FOR A BRIGHTER TOMORROW' placed at the bottom edge beneath the text block.",
  ].join('\n');

  const newModes = {
    ...cfg.composition_modes,
    both: [
      'Upper-Center Composition & Visual Background (Occupying the upper 60% of the canvas):',
      '- Focal Point: A highly realistic, authoritative editorial portrait photo of {{personName}}{{personRole}}, wearing a sharply tailored dark business suit, crisp white dress shirt, silk tie, natural expression at a 3/4 angle with cinematic warm golden amber lighting, positioned prominently in the upper-center area.',
      '- Left Flanking Visual Elements:',
      '  1. Clean editorial executive quote card in quotation marks attributed to {{personName}}.',
      '  2. Editorial market card for stock {{stockTicker}} ({{stockName}}) featuring the complete company name, prominent bold stock price nominal Rp {{stockPrice}}, {{gainColor}} gain indicator {{gainIndicator}}, and a sharp multi-bar candlestick chart.',
      '- Right Flanking Visual Elements:',
      '  1. Modern glass skyscrapers of the Jakarta financial district with office windows glowing with warm amber light at dusk.',
      '  2. Clean corporate emblem card featuring the official circular logo of {{stockName}}, full corporate entity name, and official corporate tagline.',
    ].join('\n'),
    person_only: [
      'Upper-Center Composition & Visual Background (Occupying the upper 60% of the canvas):',
      '- Focal Point: Authentic photojournalistic executive portrait of {{personName}}{{personRole}} with cinematic warm amber & gold lighting.',
      '- Background: Modern Indonesian financial architecture or executive boardroom with warm ambient lighting.',
    ].join('\n'),
    stocks_only: [
      'Upper-Center Composition & Visual Background (Occupying the upper 55% of the canvas):',
      '- Focal Point: {{stockCardsDetail}}, positioned symmetrically in the upper half.',
      '- Background & Environment: Modern Indonesia Stock Exchange (IDX) trading floor backdrop with warm ambient lighting, order book depth data, and clean illuminated financial indicators across the upper canvas.',
    ].join('\n'),
    macro_general: [
      'Upper-Center Composition & Visual Background (Occupying the upper 55% of the canvas):',
      '- Focal Point: Monumental Indonesian financial architecture bathed in cinematic warm amber and dusk golden light.',
    ].join('\n'),
  };

  const updated = await promptService.updatePrompt('finance', 'visual_image', {
    systemPrompt: newSystemPrompt,
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
