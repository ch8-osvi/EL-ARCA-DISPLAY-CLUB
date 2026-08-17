const sharp = require('sharp');
const fs = require('fs');

async function generateIcons() {
  const inputFile = 'public/logo.png';
  
  // Apple Touch Icon needs a solid background to avoid being filled with black incorrectly,
  // but since we want black, we explicitly flatten it with a black background.
  await sharp(inputFile)
    .resize(180, 180, { fit: 'contain', background: { r: 9, g: 10, b: 15, alpha: 1 } }) // #090A0F background
    .flatten({ background: { r: 9, g: 10, b: 15 } })
    .toFile('public/apple-touch-icon.png');
    
  console.log('Created apple-touch-icon.png (180x180)');

  // Android standard icons
  await sharp(inputFile)
    .resize(192, 192, { fit: 'contain', background: { r: 9, g: 10, b: 15, alpha: 0 } })
    .toFile('public/icon-192.png');
    
  await sharp(inputFile)
    .resize(512, 512, { fit: 'contain', background: { r: 9, g: 10, b: 15, alpha: 0 } })
    .toFile('public/icon-512.png');
    
  console.log('Created PWA icons (192x192, 512x512)');
}

generateIcons().catch(console.error);
