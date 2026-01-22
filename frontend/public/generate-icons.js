const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
// Use the project's logging library instead of bare console for consistency
const log = require('loglevel');
const logger = log;
logger.setLevel('info');

const svgPath = path.join(__dirname, 'sudoku-icon.svg');
const svg = fs.readFileSync(svgPath);

const sizes = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 }
];

async function generateIcons() {
  for (const { name, size } of sizes) {
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, name));
    logger.info(`Generated ${name}`);
  }
}

generateIcons().then(() => logger.info('All icons generated!'));
