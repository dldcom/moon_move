import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const [sourcePath, outputDirectory, profile = 'v1'] = process.argv.slice(2);
if (!sourcePath || !outputDirectory) {
  throw new Error('Usage: node scripts/extract-landscape-sprites.mjs <source.png> <output-directory>');
}

const v1Names = [
  'mountain-a', 'mountain-b', 'mountain-c', 'distant-ridge',
  'hill-a', 'hill-b', 'rock-mound', 'grass-edge',
  'deciduous-tree-a', 'deciduous-tree-b', 'pine-tree-a', 'pine-tree-b',
  'apartment', 'office-building', 'shrub-cluster', 'grass-rock-cluster',
];
const v2Names = [
  'rear-mountain-a', 'rear-mountain-b', 'rear-mountain-c', 'rear-mountain-d',
  'middle-mountain-a', 'middle-mountain-b', 'middle-mountain-c', 'middle-mountain-d',
  'foreground-ridge-a', 'foreground-ridge-b', 'foreground-ridge-c', 'foreground-ridge-d',
  'tree-cluster', 'lone-tree', 'apartment-silhouette', 'office-silhouette',
];
const names = profile === 'v2' ? v2Names : v1Names;

const source = PNG.sync.read(fs.readFileSync(sourcePath));
const columns = 4;
const rows = 4;
const columnCuts = profile === 'v2'
  ? Array.from({ length: columns + 1 }, (_, index) => Math.round(source.width * index / columns))
  : [0, 384, 768, 1152, source.width];
const rowCuts = profile === 'v2'
  ? Array.from({ length: rows + 1 }, (_, index) => Math.round(source.height * index / rows))
  : [0, 270, 460, 750, source.height];
const keyColor = { r: 230, g: 25, b: 226 };

function alphaFor(r, g, b) {
  const magentaStrength = Math.min(r, b) - g;
  const balance = Math.abs(r - b);
  if (magentaStrength >= 90) return 0;
  if (balance > 82 || magentaStrength <= 38) return 255;
  const amount = (magentaStrength - 38) / 52;
  return Math.round(255 * (1 - amount * amount));
}

function removeChromaKey(image) {
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset];
    const g = image.data[offset + 1];
    const b = image.data[offset + 2];
    const alpha = alphaFor(r, g, b);
    image.data[offset + 3] = alpha;
    if (alpha === 0) {
      image.data[offset] = 0;
      image.data[offset + 1] = 0;
      image.data[offset + 2] = 0;
    } else if (alpha < 255) {
      const coverage = alpha / 255;
      image.data[offset] = Math.max(0, Math.min(255, Math.round((r - keyColor.r * (1 - coverage)) / coverage)));
      image.data[offset + 1] = Math.max(0, Math.min(255, Math.round((g - keyColor.g * (1 - coverage)) / coverage)));
      image.data[offset + 2] = Math.max(0, Math.min(255, Math.round((b - keyColor.b * (1 - coverage)) / coverage)));
    }
  }
}

function cropCell(image, column, row) {
  const startX = columnCuts[column];
  const startY = rowCuts[row];
  const cellWidth = columnCuts[column + 1] - startX;
  const cellHeight = rowCuts[row + 1] - startY;
  let minX = cellWidth;
  let minY = cellHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      const alpha = image.data[((startY + y) * image.width + startX + x) * 4 + 3];
      if (alpha < 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) throw new Error(`No visible pixels in cell ${row},${column}`);
  const padding = 8;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(cellWidth - 1, maxX + padding);
  maxY = Math.min(cellHeight - 1, maxY + padding);
  const output = new PNG({ width: maxX - minX + 1, height: maxY - minY + 1 });

  for (let y = 0; y < output.height; y += 1) {
    const sourceStart = ((startY + minY + y) * image.width + startX + minX) * 4;
    const targetStart = y * output.width * 4;
    image.data.copy(output.data, targetStart, sourceStart, sourceStart + output.width * 4);
  }
  return output;
}

removeChromaKey(source);
fs.mkdirSync(outputDirectory, { recursive: true });

for (let row = 0; row < rows; row += 1) {
  for (let column = 0; column < columns; column += 1) {
    const index = row * columns + column;
    const sprite = cropCell(source, column, row);
    fs.writeFileSync(path.join(outputDirectory, `${String(index + 1).padStart(2, '0')}-${names[index]}.png`), PNG.sync.write(sprite));
  }
}

console.log(JSON.stringify({ source: sourcePath, outputDirectory, sprites: names.length }, null, 2));
