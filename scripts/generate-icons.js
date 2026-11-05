const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 1. Standard App Icon SVG (Minimalist & Modern KCIC Fleet Monogram + Precision Nav Arrow)
const standardSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#022c22" />
      <stop offset="50%" stop-color="#064e3b" />
      <stop offset="100%" stop-color="#047857" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
  </defs>

  <!-- Background Solid / Rounded Squircle -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)" />

  <!-- Outer Precision Telemetry Ring -->
  <circle cx="256" cy="256" r="196" fill="none" stroke="#10b981" stroke-width="6" opacity="0.25" stroke-dasharray="14 10" />
  
  <!-- Subtle Cardinal Ticks -->
  <line x1="256" y1="44" x2="256" y2="72" stroke="#34d399" stroke-width="6" stroke-linecap="round" />
  <line x1="256" y1="440" x2="256" y2="468" stroke="#34d399" stroke-width="6" stroke-linecap="round" opacity="0.4" />
  <line x1="44" y1="256" x2="72" y2="256" stroke="#34d399" stroke-width="6" stroke-linecap="round" opacity="0.4" />
  <line x1="440" y1="256" x2="468" y2="256" stroke="#34d399" stroke-width="6" stroke-linecap="round" />

  <!-- Inner High-Contrast Hex / Shield Base -->
  <circle cx="256" cy="256" r="148" fill="#021c16" stroke="#34d399" stroke-width="5" opacity="0.8" />

  <!-- Dynamic Geometric "KF" + Nav Arrow Monogram -->
  <g transform="translate(256, 256)">
    <!-- Central Dynamic Nav Compass Arrow (Pointing Forward/North-East) -->
    <!-- Left Wing (Emerald) -->
    <polygon points="0,-104 -78,64 0,28" fill="url(#accentGrad)" />
    <!-- Right Wing (Lighter Emerald Accent) -->
    <polygon points="0,-104 78,64 0,28" fill="#a7f3d0" />
    
    <!-- Central Core Radar Ping Dot -->
    <circle cx="0" cy="28" r="14" fill="url(#goldGrad)" />
    
    <!-- Pulse Ring around Beacon -->
    <circle cx="0" cy="28" r="32" fill="none" stroke="#fef08a" stroke-width="4" opacity="0.6" stroke-dasharray="6 4" />
  </g>

  <!-- Bottom Brand Text Monogram Badge -->
  <rect x="180" y="380" width="152" height="36" rx="18" fill="#022c22" stroke="#34d399" stroke-width="3" />
  <text x="256" y="404" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="19" font-weight="900" fill="#ffffff" letter-spacing="3.5">
    KCIC
  </text>
</svg>
`;

// 2. Maskable Icon SVG (Safe zone centered inside 80% circle)
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGradMask" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#022c22" />
      <stop offset="50%" stop-color="#064e3b" />
      <stop offset="100%" stop-color="#047857" />
    </linearGradient>
    <linearGradient id="accentGradMask" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
    <linearGradient id="goldGradMask" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
  </defs>

  <!-- Full Bleed Background for Maskable Icon -->
  <rect width="512" height="512" fill="url(#bgGradMask)" />

  <!-- Safe Zone Elements centered in ~75% radius -->
  <!-- Outer Precision Telemetry Ring -->
  <circle cx="256" cy="256" r="160" fill="none" stroke="#10b981" stroke-width="5" opacity="0.25" stroke-dasharray="12 8" />

  <!-- Inner Dark Core -->
  <circle cx="256" cy="256" r="124" fill="#021c16" stroke="#34d399" stroke-width="4" opacity="0.8" />

  <!-- Nav Arrow Symbol (Scaled for Safe Zone) -->
  <g transform="translate(256, 252) scale(0.85)">
    <!-- Left Wing -->
    <polygon points="0,-104 -78,64 0,28" fill="url(#accentGradMask)" />
    <!-- Right Wing -->
    <polygon points="0,-104 78,64 0,28" fill="#a7f3d0" />
    
    <!-- Central Core Radar Ping Dot -->
    <circle cx="0" cy="28" r="14" fill="url(#goldGradMask)" />
    <!-- Pulse Ring -->
    <circle cx="0" cy="28" r="32" fill="none" stroke="#fef08a" stroke-width="4" opacity="0.6" stroke-dasharray="6 4" />
  </g>

  <!-- Text Monogram Badge -->
  <rect x="194" y="362" width="124" height="28" rx="14" fill="#022c22" stroke="#34d399" stroke-width="2.5" />
  <text x="256" y="381" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="900" fill="#ffffff" letter-spacing="3">
    KCIC
  </text>
</svg>
`;

async function generate() {
  const iconsDir = path.join(__dirname, '..', 'public', 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  // Write SVGs
  fs.writeFileSync(path.join(iconsDir, 'icon.svg'), standardSvg);
  fs.writeFileSync(path.join(iconsDir, 'maskable.svg'), maskableSvg);

  // Generate icon-512.png
  await sharp(Buffer.from(standardSvg))
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'icon-512.png'));
  console.log('Generated icon-512.png');

  // Generate icon-192.png
  await sharp(Buffer.from(standardSvg))
    .resize(192, 192)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'icon-192.png'));
  console.log('Generated icon-192.png');

  // Generate apple-touch-icon.png (180x180)
  await sharp(Buffer.from(standardSvg))
    .resize(180, 180)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // Generate maskable-512.png
  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'maskable-512.png'));
  console.log('Generated maskable-512.png');

  // Generate favicon-32.png in public
  await sharp(Buffer.from(standardSvg))
    .resize(32, 32)
    .png()
    .toFile(path.join(__dirname, '..', 'public', 'favicon.png'));
  console.log('Generated favicon.png');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
