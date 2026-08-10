/**
 * Smart EDMS — App icon generator
 *
 * Generates PNG icons from logo.svg for:
 *   - PWA manifest (192x192, 512x512, maskable-512)
 *   - Apple touch icon (180x180)
 *   - Push notification badge (72x72)
 *
 * Run: npx bun run scripts/generate-icons.ts
 */

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

const LOGO_PATH = path.join(process.cwd(), 'public', 'logo.svg');
const OUTPUT_DIR = path.join(process.cwd(), 'public');

// Background color for icons (matches dark theme background)
const BG_COLOR = '#0f172a';

async function generateIcon(size: number, name: string, options?: { padding?: number; bg?: boolean }) {
  let svg = await fs.readFile(LOGO_PATH, 'utf-8');
  // Strip XML declaration (not valid inside an embedded SVG)
  svg = svg.replace(/<\?xml[^>]*\?>/, '').trim();
  // Extract inner SVG content (everything between <svg ...> and </svg>)
  const innerMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const inner = innerMatch ? innerMatch[1] : svg;

  const padding = options?.padding ?? Math.floor(size * 0.15);
  const innerSize = size - padding * 2;

  // Create a composite SVG: background + centered logo
  const compositeSvg = options?.bg === false
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 30 30">${inner}</svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${BG_COLOR}" rx="${Math.floor(size * 0.18)}"/>
  <g transform="translate(${padding}, ${padding}) scale(${innerSize / 30})">
    ${inner}
  </g>
</svg>`;

  const outputPath = path.join(OUTPUT_DIR, name);
  await sharp(Buffer.from(compositeSvg))
    .resize(size, size)
    .png()
    .toFile(outputPath);

  console.log(`  ✓ ${name} (${size}x${size})`);
}

async function main() {
  console.log('🎨 Generating Smart EDMS app icons...\n');

  // Check logo.svg exists
  try {
    await fs.access(LOGO_PATH);
  } catch {
    console.error(`❌ logo.svg not found at ${LOGO_PATH}`);
    process.exit(1);
  }

  // Generate all icon sizes
  await generateIcon(192, 'icon-192.png');
  await generateIcon(512, 'icon-512.png');
  await generateIcon(512, 'icon-maskable-512.png', { padding: Math.floor(512 * 0.08) }); // maskable needs more padding
  await generateIcon(180, 'apple-touch-icon.png');
  await generateIcon(72, 'badge-72.png', { bg: false }); // transparent badge

  console.log('\n✅ All icons generated successfully.');
}

main().catch(console.error);
