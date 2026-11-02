import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const outputDir = path.resolve('public/icons');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 512x512 standard icon SVG with rounded rectangle and vehicle glyph
const standardSvg = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="#0F172A"/>
  <!-- Location radar ring -->
  <circle cx="256" cy="180" r="110" stroke="#10B981" stroke-width="12" stroke-opacity="0.35"/>
  <circle cx="256" cy="180" r="70" stroke="#10B981" stroke-width="16" stroke-dasharray="16 16"/>
  
  <!-- Car silhouette / fleet vehicle icon -->
  <g transform="translate(106, 230)">
    <!-- Car body upper / cabin -->
    <path d="M70 70 L100 20 C105 10 115 5 130 5 L170 5 C185 5 195 10 200 20 L230 70 Z" fill="#38BDF8"/>
    <!-- Cabin windows -->
    <path d="M108 62 L128 20 C130 16 135 14 142 14 L154 14 L154 62 Z" fill="#0F172A" fill-opacity="0.9"/>
    <path d="M166 62 L166 14 L178 14 C185 14 190 16 192 20 L212 62 Z" fill="#0F172A" fill-opacity="0.9"/>
    <!-- Car body lower -->
    <rect x="20" y="65" width="260" height="65" rx="18" fill="#F8FAFC"/>
    <!-- Headlight & taillight -->
    <rect x="260" y="75" width="16" height="18" rx="4" fill="#FBBF24"/>
    <rect x="24" y="75" width="12" height="18" rx="4" fill="#EF4444"/>
    <!-- Wheels -->
    <circle cx="75" cy="130" r="28" fill="#1E293B"/>
    <circle cx="75" cy="130" r="14" fill="#94A3B8"/>
    <circle cx="225" cy="130" r="28" fill="#1E293B"/>
    <circle cx="225" cy="130" r="14" fill="#94A3B8"/>
  </g>

  <!-- GPS location pin dot -->
  <circle cx="256" cy="180" r="18" fill="#10B981"/>
  <circle cx="256" cy="180" r="8" fill="#FFFFFF"/>
</svg>
`;

// Maskable icon requires no corner radius on root rect (OS clips it) and safe padding (within 80% inner circle)
const maskableSvg = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#0F172A"/>
  <!-- Scaled down to safe zone (80% = ~400px center) -->
  <g transform="translate(51, 51) scale(0.8)">
    <circle cx="256" cy="180" r="110" stroke="#10B981" stroke-width="12" stroke-opacity="0.35"/>
    <circle cx="256" cy="180" r="70" stroke="#10B981" stroke-width="16" stroke-dasharray="16 16"/>
    
    <g transform="translate(106, 230)">
      <path d="M70 70 L100 20 C105 10 115 5 130 5 L170 5 C185 5 195 10 200 20 L230 70 Z" fill="#38BDF8"/>
      <path d="M108 62 L128 20 C130 16 135 14 142 14 L154 14 L154 62 Z" fill="#0F172A" fill-opacity="0.9"/>
      <path d="M166 62 L166 14 L178 14 C185 14 190 16 192 20 L212 62 Z" fill="#0F172A" fill-opacity="0.9"/>
      <rect x="20" y="65" width="260" height="65" rx="18" fill="#F8FAFC"/>
      <rect x="260" y="75" width="16" height="18" rx="4" fill="#FBBF24"/>
      <rect x="24" y="75" width="12" height="18" rx="4" fill="#EF4444"/>
      <circle cx="75" cy="130" r="28" fill="#1E293B"/>
      <circle cx="75" cy="130" r="14" fill="#94A3B8"/>
      <circle cx="225" cy="130" r="28" fill="#1E293B"/>
      <circle cx="225" cy="130" r="14" fill="#94A3B8"/>
    </g>

    <circle cx="256" cy="180" r="18" fill="#10B981"/>
    <circle cx="256" cy="180" r="8" fill="#FFFFFF"/>
  </g>
</svg>
`;

async function generate() {
  const standardBuffer = Buffer.from(standardSvg);
  const maskableBuffer = Buffer.from(maskableSvg);

  // 1. icon-512.png
  await sharp(standardBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(outputDir, 'icon-512.png'));
  console.log('Generated icon-512.png');

  // 2. icon-192.png
  await sharp(standardBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(outputDir, 'icon-192.png'));
  console.log('Generated icon-192.png');

  // 3. apple-touch-icon.png (180x180)
  await sharp(standardBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(outputDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // 4. maskable-512.png
  await sharp(maskableBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(outputDir, 'maskable-512.png'));
  console.log('Generated maskable-512.png');
}

generate().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
