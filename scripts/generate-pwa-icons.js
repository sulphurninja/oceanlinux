/**
 * Generate web favicons from public/ol.png (site brand — green circle).
 * Android/PWA store icons from assets/oceanlinux-app-icon-source.png (APK blue icon).
 *
 * Usage: bun scripts/generate-pwa-icons.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WEB_SOURCE = path.join(ROOT, 'public', 'ol.png');
const APK_SOURCE = path.join(ROOT, 'assets', 'oceanlinux-app-icon-source.png');
const PUBLIC = path.join(ROOT, 'public');

const WEB_SIZES = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'logo.png', size: 512 },
];

const APK_SIZES = [
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
  { name: 'maskable-icon-512x512.png', size: 512, maskable: true },
];

async function writeIcons(sharp, sourcePath, sizes, label) {
  if (!fs.existsSync(sourcePath)) {
    console.warn(`Skip ${label}: missing ${sourcePath}`);
    return;
  }

  for (const { name, size, maskable } of sizes) {
    let pipeline;

    if (maskable) {
      pipeline = sharp(sourcePath)
        .resize(Math.round(size * 0.72), Math.round(size * 0.72), {
          fit: 'contain',
          background: '#0ea5e9',
        })
        .extend({
          top: Math.round(size * 0.14),
          bottom: Math.round(size * 0.14),
          left: Math.round(size * 0.14),
          right: Math.round(size * 0.14),
          background: '#0ea5e9',
        });
    } else {
      pipeline = sharp(sourcePath).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
    }

    await pipeline.png().toFile(path.join(PUBLIC, name));
    console.log(`Wrote ${name} (${label})`);
  }
}

async function main() {
  if (!fs.existsSync(WEB_SOURCE)) {
    console.error('Missing site logo:', WEB_SOURCE);
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

  await writeIcons(sharp, WEB_SOURCE, WEB_SIZES, 'web/ol.png');

  // Browser tab favicon.ico — always from ol.png
  await sharp(WEB_SOURCE)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(PUBLIC, 'favicon.ico'));
  console.log('Wrote favicon.ico (web/ol.png)');

  await writeIcons(sharp, APK_SOURCE, APK_SIZES, 'apk');

  console.log('Done — browser favicons use ol.png; APK icons use assets/oceanlinux-app-icon-source.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
