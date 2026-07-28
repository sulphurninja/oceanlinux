/**
 * Generate PWA / Android launcher icons from assets/oceanlinux-app-icon-source.png
 * Usage: bun scripts/generate-pwa-icons.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'oceanlinux-app-icon-source.png');
const PUBLIC = path.join(ROOT, 'public');

const SIZES = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
  { name: 'maskable-icon-512x512.png', size: 512, maskable: true },
  { name: 'logo.png', size: 512 },
];

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('Missing source icon:', SOURCE);
    process.exit(1);
  }

  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('Install sharp first: bun add -d sharp');
    process.exit(1);
  }

  if (!fs.existsSync(PUBLIC)) fs.mkdirSync(PUBLIC, { recursive: true });

  for (const { name, size, maskable } of SIZES) {
    let pipeline = sharp(SOURCE).resize(size, size, { fit: 'cover' });

    if (maskable) {
      // Maskable safe zone ~80% — pad icon on solid brand background
      pipeline = sharp(SOURCE)
        .resize(Math.round(size * 0.72), Math.round(size * 0.72), { fit: 'contain', background: '#0ea5e9' })
        .extend({
          top: Math.round(size * 0.14),
          bottom: Math.round(size * 0.14),
          left: Math.round(size * 0.14),
          right: Math.round(size * 0.14),
          background: '#0ea5e9',
        });
    }

    await pipeline.png().toFile(path.join(PUBLIC, name));
    console.log('Wrote', name);
  }

  // favicon.ico from 32px
  await sharp(SOURCE)
    .resize(32, 32)
    .png()
    .toFile(path.join(PUBLIC, 'favicon.ico'));

  console.log('Done — icons in public/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
