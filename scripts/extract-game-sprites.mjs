import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const [sourcePath, outputDirectory, profile = 'moons'] = process.argv.slice(2);
if (!sourcePath || !outputDirectory) {
  throw new Error('Usage: node scripts/extract-game-sprites.mjs <source.png> <output-directory>');
}

const moonNames = [
  'waxing-crescent', 'first-quarter', 'full-moon', 'last-quarter',
  'waning-crescent', 'waxing-crescent-alt', 'first-quarter-alt', 'full-moon-alt',
  'waxing-crescent-hurt', 'first-quarter-hurt', 'full-moon-hurt', 'last-quarter-hurt',
  'waning-crescent-hurt', 'waxing-crescent-squint', 'first-quarter-squint', 'full-moon-squint',
];
const effectNames = [
  'explosion-01', 'explosion-02', 'explosion-03', 'explosion-04',
  'sparkle-01', 'sparkle-02', 'sparkle-03', 'sparkle-04',
  'debris-01', 'debris-02', 'debris-03', 'debris-04',
  'heart-full', 'heart-cracked', 'heart-empty', 'combo-star',
];
const names = profile === 'effects' ? effectNames : moonNames;

const source = PNG.sync.read(fs.readFileSync(sourcePath));
const columns = 4;
const rows = 4;
const frameSize = 128;
const padding = 6;

function chromaAlpha(r, g, b) {
  // Remove both the flat chroma field and the darker anti-aliased fringe.
  // The moon palette is navy/ivory, so pixels whose red and blue channels
  // strongly dominate green are safe to treat as pink spill.
  const lowerPurple = Math.min(r, b);
  const pinkBalance = Math.abs(r - b);
  if (lowerPurple > 34 && g < lowerPurple * 0.72 && pinkBalance < 130) return 0;
  return 255;
}

function extractCell(column, row) {
  const startX = Math.round(source.width * column / columns);
  const endX = Math.round(source.width * (column + 1) / columns);
  const startY = Math.round(source.height * row / rows);
  const endY = Math.round(source.height * (row + 1) / rows);
  let minX = endX;
  let minY = endY;
  let maxX = startX;
  let maxY = startY;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * source.width + x) * 4;
      const alpha = Math.min(source.data[offset + 3], chromaAlpha(source.data[offset], source.data[offset + 1], source.data[offset + 2]));
      if (alpha <= 16) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX <= minX || maxY <= minY) throw new Error(`Empty sprite cell ${row},${column}`);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const scale = Math.min((frameSize - padding * 2) / width, (frameSize - padding * 2) / height);
  const output = new PNG({ width: frameSize, height: frameSize });
  const renderedWidth = Math.max(1, Math.round(width * scale));
  const renderedHeight = Math.max(1, Math.round(height * scale));
  const targetX = Math.round((frameSize - renderedWidth) / 2);
  const targetY = frameSize - padding - renderedHeight;

  for (let y = 0; y < renderedHeight; y += 1) {
    for (let x = 0; x < renderedWidth; x += 1) {
      const sourceX = minX + Math.min(width - 1, Math.floor(x / scale));
      const sourceY = minY + Math.min(height - 1, Math.floor(y / scale));
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const outputOffset = ((targetY + y) * frameSize + targetX + x) * 4;
      const r = source.data[sourceOffset];
      const g = source.data[sourceOffset + 1];
      const b = source.data[sourceOffset + 2];
      const alpha = Math.min(source.data[sourceOffset + 3], chromaAlpha(r, g, b));
      output.data[outputOffset] = alpha === 0 ? 0 : r;
      output.data[outputOffset + 1] = alpha === 0 ? 0 : g;
      output.data[outputOffset + 2] = alpha === 0 ? 0 : b;
      output.data[outputOffset + 3] = alpha;
    }
  }
  return output;
}

fs.mkdirSync(outputDirectory, { recursive: true });
for (let row = 0; row < rows; row += 1) {
  for (let column = 0; column < columns; column += 1) {
    const index = row * columns + column;
    const sprite = extractCell(column, row);
    fs.writeFileSync(path.join(outputDirectory, `${String(index + 1).padStart(2, '0')}-${names[index]}.png`), PNG.sync.write(sprite));
  }
}

console.log(JSON.stringify({ source: sourcePath, outputDirectory, sprites: names.length, frameSize }, null, 2));
