// Takes the JSTREAM logo PNG, composites it onto a square dark background,
// generates multiple sizes, and converts to .ico for Electron packaging.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

async function main() {
  const assetsDir = path.join(__dirname, '..', 'assets', 'images');
  const logoPath = path.join(assetsDir, 'original-logo-backup.png');
  const iconPngPath = path.join(assetsDir, 'icon.png');
  const icoPath = path.join(assetsDir, 'icon.ico');

  if (!fs.existsSync(logoPath)) {
    console.error('Logo not found at', logoPath);
    process.exit(1);
  }

  console.log('Creating 256x256 square icon from logo...');

  // Get logo dimensions
  const logoMeta = await sharp(logoPath).metadata();
  console.log(`Logo: ${logoMeta.width}x${logoMeta.height}`);

  // Create a 256x256 icon: black background with the red JSTREAM logo centered
  // Resize logo to fit within the icon with padding
  const iconSize = 256;
  const logoPadding = Math.floor(iconSize * 0.12); // 12% padding on each side
  const maxLogoWidth = iconSize - logoPadding * 2;
  const maxLogoHeight = iconSize - logoPadding * 2;

  const resizedLogo = await sharp(logoPath)
    .resize(maxLogoWidth, maxLogoHeight, { fit: 'inside' })
    .toBuffer();

  const icon256 = await sharp({
    create: {
      width: iconSize,
      height: iconSize,
      channels: 4,
      background: { r: 20, g: 20, b: 20, alpha: 255 }
    }
  })
    .composite([{ input: resizedLogo, gravity: 'centre' }])
    .png()
    .toFile(iconPngPath);

  console.log('Saved icon PNG:', iconPngPath);

  // Convert PNG to ICO
  console.log('Converting to ICO...');
  const icoBuffer = await pngToIco(iconPngPath);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('Saved ICO:', icoPath);

  console.log('Done! Icon files generated at:');
  console.log('  PNG:', iconPngPath);
  console.log('  ICO:', icoPath);
}

main().catch(console.error);
