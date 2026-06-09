const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

const sizes = [16, 32, 48, 64, 128, 256];
const outputDir = path.join(__dirname, 'icons');
const sourcePath = path.join(outputDir, 'logo-source.png');

async function createPng(size) {
  const pngPath = path.join(outputDir, `icon-${size}.png`);
  await sharp(sourcePath)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(pngPath);
  return pngPath;
}

async function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error(`Missing logo source: ${sourcePath}`);
    process.exit(1);
  }

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
