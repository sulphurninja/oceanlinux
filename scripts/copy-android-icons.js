/**
 * Copy launcher icons into android/app/src/main/res/mipmap-*
 * Usage: bun scripts/copy-android-icons.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'oceanlinux-app-icon-source.png');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

const DENSITIES = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'android'))) {
    console.error('Run bun run cap:init first');
    process.exit(1);
  }

  const sharp = require('sharp');

  for (const { folder, size } of DENSITIES) {
    const dir = path.join(RES, folder);
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, 'ic_launcher.png');
    const round = path.join(dir, 'ic_launcher_round.png');
    await sharp(SOURCE).resize(size, size).png().toFile(out);
    await sharp(SOURCE).resize(size, size).png().toFile(round);
    console.log('Wrote', folder);
  }

  // Splash drawable background color is in capacitor.config.ts
  console.log('Android launcher icons updated');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
