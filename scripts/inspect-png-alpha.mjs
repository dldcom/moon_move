import fs from 'node:fs';
import { PNG } from 'pngjs';

for (const sourcePath of process.argv.slice(2)) {
  const image = PNG.sync.read(fs.readFileSync(sourcePath));
  let transparent = 0;
  let opaque = 0;
  let minAlpha = 255;
  let magentaFringe = 0;
  const darkColors = new Map();
  for (let offset = 3; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset];
    minAlpha = Math.min(minAlpha, alpha);
    if (alpha < 8) transparent += 1;
    if (alpha > 247) opaque += 1;
    if (alpha > 8) {
      const r = image.data[offset - 3];
      const g = image.data[offset - 2];
      const b = image.data[offset - 1];
      if (r > 45 && b > 45 && g < Math.min(r, b) * 0.68) magentaFringe += 1;
      if (b > r * 1.25 && b > g * 1.15 && r + g + b < 250) {
        const key = `${r},${g},${b}`;
        darkColors.set(key, (darkColors.get(key) ?? 0) + 1);
      }
    }
  }
  const dominantDarkColors = [...darkColors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(JSON.stringify({ sourcePath, width: image.width, height: image.height, minAlpha, transparent, opaque, magentaFringe, dominantDarkColors }));
}
