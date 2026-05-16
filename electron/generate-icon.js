const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

const sizes = [16, 32, 48, 64, 128, 256];
const baseColor = '#0f172a';
const outputDir = path.join(__dirname, 'icons');

async function createPng(size) {
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${baseColor}" rx="${Math.round(size * 0.18)}" ry="${Math.round(size * 0.18)}"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
            font-family="Segoe UI, Arial, sans-serif"
            font-size="${Math.round(size * 0.44)}"
            font-weight="700"
            fill="#ffffff">PR</text>
    </svg>
  `;

  const pngPath = path.join(outputDir, `icon-${size}.png`);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
  return pngPath;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const pngFiles = [];
  for (const size of sizes) {
    const pngPath = await createPng(size);
    pngFiles.push(pngPath);
  }

  const icoBuffer = await pngToIco(pngFiles);
  const icoPath = path.join(outputDir, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);

  console.log(`Generated ${icoPath}`);
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
