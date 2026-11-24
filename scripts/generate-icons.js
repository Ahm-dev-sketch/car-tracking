const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// --------------------------------------------------------------------------
// KCIC FLEET - OFFICIAL APP ICON GENERATOR
// --------------------------------------------------------------------------
// Concept: "The Whoosh Fleet Flagship"
// - Signature KCIC Crimson Squircle Canvas with subtle high-speed aerodynamic streamlines
// - Precision Obsidian Telemetry Cockpit / Radar Dial with bevel rim
// - The 4 Operational Hub Stations (Halim, Karawang, Padalarang, Tegalluar) as telemetry waypoint nodes
// - Aerodynamic 3D Supersonic Fleet Vehicle Delta:
//   * Left Flank: Sculpted KCIC Crimson facet
//   * Right Flank: Sculpted Platinum Silver / Frost White facet
//   * Razor center spine highlight
//   * Tinted windshield cockpit with specular light flare
//   * Radiant Whoosh Gold GPS Live Telemetry Beacon at the navigation core
// --------------------------------------------------------------------------

const standardSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="kf-bg" x1="12%" y1="0%" x2="88%" y2="100%">
      <stop offset="0%" stop-color="#e11d48" />
      <stop offset="30%" stop-color="#c8102e" />
      <stop offset="70%" stop-color="#990b22" />
      <stop offset="100%" stop-color="#520512" />
    </linearGradient>

    <linearGradient id="kf-rim" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.7" />
      <stop offset="45%" stop-color="#fb7185" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.5" />
    </linearGradient>

    <linearGradient id="kf-dial" x1="15%" y1="15%" x2="85%" y2="85%">
      <stop offset="0%" stop-color="#1e2638" />
      <stop offset="45%" stop-color="#0e1422" />
      <stop offset="100%" stop-color="#04060c" />
    </linearGradient>

    <linearGradient id="kf-bezel" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45" />
      <stop offset="50%" stop-color="#64748b" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.85" />
    </linearGradient>

    <linearGradient id="kf-wing-red" x1="55%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ff4d6d" />
      <stop offset="40%" stop-color="#e11d48" />
      <stop offset="80%" stop-color="#be123c" />
      <stop offset="100%" stop-color="#7a0718" />
    </linearGradient>

    <linearGradient id="kf-wing-silver" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="40%" stop-color="#f8fafc" />
      <stop offset="80%" stop-color="#cbd5e1" />
      <stop offset="100%" stop-color="#94a3b8" />
    </linearGradient>

    <linearGradient id="kf-windshield" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.9" />
      <stop offset="30%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>

    <radialGradient id="kf-beacon-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="30%" stop-color="#fef08a" />
      <stop offset="70%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" stop-opacity="0.1" />
    </radialGradient>

    <filter id="kf-dial-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#2a0209" flood-opacity="0.95" />
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.5" />
    </filter>

    <filter id="kf-craft-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="15" flood-color="#000000" flood-opacity="0.8" />
    </filter>
  </defs>

  <rect width="512" height="512" rx="114" fill="url(#kf-bg)" />

  <g opacity="0.15" stroke="#ffffff" stroke-linecap="round">
    <path d="M -40 180 C 140 180, 260 270, 552 270" stroke-width="2.5" fill="none" />
    <path d="M -20 220 C 160 220, 280 320, 552 320" stroke-width="3" fill="none" />
    <path d="M -60 260 C 120 260, 240 370, 552 370" stroke-width="2" fill="none" />
  </g>

  <rect x="1" y="1" width="510" height="510" rx="113" fill="none" stroke="url(#kf-rim)" stroke-width="2" />

  <circle cx="256" cy="256" r="168" fill="url(#kf-dial)" filter="url(#kf-dial-shadow)" />
  <circle cx="256" cy="256" r="168" fill="none" stroke="url(#kf-bezel)" stroke-width="2.5" />

  <circle cx="256" cy="256" r="142" fill="none" stroke="#e11d48" stroke-width="1.8" stroke-dasharray="6 8" opacity="0.4" />
  <circle cx="256" cy="256" r="118" fill="none" stroke="#f43f5e" stroke-width="1.2" opacity="0.2" />

  <circle cx="156" cy="176" r="4.5" fill="#ffffff" opacity="0.95" />
  <circle cx="156" cy="176" r="8" fill="none" stroke="#fb7185" stroke-width="1.2" opacity="0.65" />
  <circle cx="220" cy="120" r="4.5" fill="#ffffff" opacity="0.95" />
  <circle cx="220" cy="120" r="8" fill="none" stroke="#fb7185" stroke-width="1.2" opacity="0.65" />
  <circle cx="360" cy="216" r="4.5" fill="#ffffff" opacity="0.95" />
  <circle cx="360" cy="216" r="8" fill="none" stroke="#fb7185" stroke-width="1.2" opacity="0.65" />
  <circle cx="336" cy="342" r="5" fill="#f59e0b" opacity="0.95" />
  <circle cx="336" cy="342" r="9" fill="none" stroke="#fde047" stroke-width="1.4" opacity="0.8" />

  <line x1="256" y1="92" x2="256" y2="102" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.75" />
  <line x1="420" y1="256" x2="410" y2="256" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.75" />
  <line x1="256" y1="420" x2="256" y2="410" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.5" />
  <line x1="92" y1="256" x2="102" y2="256" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.5" />

  <g transform="translate(256, 256) rotate(30) scale(1.1)" filter="url(#kf-craft-shadow)">
    <path d="M 0 -108 L -74 62 C -68 68, -48 56, 0 24 Z" fill="url(#kf-wing-red)" />
    <path d="M 0 -108 L 74 62 C 68 68, 48 56, 0 24 Z" fill="url(#kf-wing-silver)" />
    <path d="M 0 -92 L -20 10 L 0 22 L 20 10 Z" fill="#0c121e" opacity="0.88" />
    <path d="M 0 -76 L -14 -16 L 0 -10 L 14 -16 Z" fill="url(#kf-windshield)" />
    <polygon points="-6,-64 -2,-64 8,-22 4,-22" fill="#ffffff" opacity="0.7" />
    <line x1="0" y1="-108" x2="0" y2="24" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.85" />
    <circle cx="0" cy="24" r="28" fill="none" stroke="#fde047" stroke-width="2.2" opacity="0.5" stroke-dasharray="5 5" />
    <circle cx="0" cy="24" r="13" fill="url(#kf-beacon-glow)" />
    <circle cx="0" cy="24" r="5.5" fill="#ffffff" />
  </g>
</svg>
`;

const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="kf-bg-m" x1="12%" y1="0%" x2="88%" y2="100%">
      <stop offset="0%" stop-color="#e11d48" />
      <stop offset="30%" stop-color="#c8102e" />
      <stop offset="70%" stop-color="#990b22" />
      <stop offset="100%" stop-color="#520512" />
    </linearGradient>

    <linearGradient id="kf-dial-m" x1="15%" y1="15%" x2="85%" y2="85%">
      <stop offset="0%" stop-color="#1e2638" />
      <stop offset="45%" stop-color="#0e1422" />
      <stop offset="100%" stop-color="#04060c" />
    </linearGradient>

    <linearGradient id="kf-bezel-m" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45" />
      <stop offset="50%" stop-color="#64748b" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.85" />
    </linearGradient>

    <linearGradient id="kf-wing-red-m" x1="55%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ff4d6d" />
      <stop offset="40%" stop-color="#e11d48" />
      <stop offset="80%" stop-color="#be123c" />
      <stop offset="100%" stop-color="#7a0718" />
    </linearGradient>

    <linearGradient id="kf-wing-silver-m" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="40%" stop-color="#f8fafc" />
      <stop offset="80%" stop-color="#cbd5e1" />
      <stop offset="100%" stop-color="#94a3b8" />
    </linearGradient>

    <linearGradient id="kf-windshield-m" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.9" />
      <stop offset="30%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>

    <radialGradient id="kf-beacon-glow-m" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="30%" stop-color="#fef08a" />
      <stop offset="70%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" stop-opacity="0.1" />
    </radialGradient>

    <filter id="kf-dial-shadow-m" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#2a0209" flood-opacity="0.95" />
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.5" />
    </filter>

    <filter id="kf-craft-shadow-m" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="15" flood-color="#000000" flood-opacity="0.8" />
    </filter>
  </defs>

  <rect width="512" height="512" fill="url(#kf-bg-m)" />

  <g opacity="0.15" stroke="#ffffff" stroke-linecap="round">
    <path d="M -40 180 C 140 180, 260 270, 552 270" stroke-width="2.5" fill="none" />
    <path d="M -20 220 C 160 220, 280 320, 552 320" stroke-width="3" fill="none" />
    <path d="M -60 260 C 120 260, 240 370, 552 370" stroke-width="2" fill="none" />
  </g>

  <g transform="translate(256, 256) scale(0.94) translate(-256, -256)">
    <circle cx="256" cy="256" r="168" fill="url(#kf-dial-m)" filter="url(#kf-dial-shadow-m)" />
    <circle cx="256" cy="256" r="168" fill="none" stroke="url(#kf-bezel-m)" stroke-width="2.5" />

    <circle cx="256" cy="256" r="142" fill="none" stroke="#e11d48" stroke-width="1.8" stroke-dasharray="6 8" opacity="0.4" />
    <circle cx="256" cy="256" r="118" fill="none" stroke="#f43f5e" stroke-width="1.2" opacity="0.2" />

    <circle cx="156" cy="176" r="4.5" fill="#ffffff" opacity="0.95" />
    <circle cx="156" cy="176" r="8" fill="none" stroke="#fb7185" stroke-width="1.2" opacity="0.65" />
    <circle cx="220" cy="120" r="4.5" fill="#ffffff" opacity="0.95" />
    <circle cx="220" cy="120" r="8" fill="none" stroke="#fb7185" stroke-width="1.2" opacity="0.65" />
    <circle cx="360" cy="216" r="4.5" fill="#ffffff" opacity="0.95" />
    <circle cx="360" cy="216" r="8" fill="none" stroke="#fb7185" stroke-width="1.2" opacity="0.65" />
    <circle cx="336" cy="342" r="5" fill="#f59e0b" opacity="0.95" />
    <circle cx="336" cy="342" r="9" fill="none" stroke="#fde047" stroke-width="1.4" opacity="0.8" />

    <line x1="256" y1="92" x2="256" y2="102" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.75" />
    <line x1="420" y1="256" x2="410" y2="256" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.75" />
    <line x1="256" y1="420" x2="256" y2="410" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.5" />
    <line x1="92" y1="256" x2="102" y2="256" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.5" />

    <g transform="translate(256, 256) rotate(30) scale(1.1)" filter="url(#kf-craft-shadow-m)">
      <path d="M 0 -108 L -74 62 C -68 68, -48 56, 0 24 Z" fill="url(#kf-wing-red-m)" />
      <path d="M 0 -108 L 74 62 C 68 68, 48 56, 0 24 Z" fill="url(#kf-wing-silver-m)" />
      <path d="M 0 -92 L -20 10 L 0 22 L 20 10 Z" fill="#0c121e" opacity="0.88" />
      <path d="M 0 -76 L -14 -16 L 0 -10 L 14 -16 Z" fill="url(#kf-windshield-m)" />
      <polygon points="-6,-64 -2,-64 8,-22 4,-22" fill="#ffffff" opacity="0.7" />
      <line x1="0" y1="-108" x2="0" y2="24" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.85" />
      <circle cx="0" cy="24" r="28" fill="none" stroke="#fde047" stroke-width="2.2" opacity="0.5" stroke-dasharray="5 5" />
      <circle cx="0" cy="24" r="13" fill="url(#kf-beacon-glow-m)" />
      <circle cx="0" cy="24" r="5.5" fill="#ffffff" />
    </g>
  </g>
</svg>
`;

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const dirEntries = [];
  let currentOffset = 6 + images.length * 16;

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.buffer.length, 8);
    entry.writeUInt32LE(currentOffset, 12);
    dirEntries.push(entry);
    currentOffset += img.buffer.length;
  }

  return Buffer.concat([header, ...dirEntries, ...images.map((img) => img.buffer)]);
}

async function generate() {
  const root = path.join(__dirname, '..');
  const iconsDir = path.join(root, 'public', 'icons');
  const publicDir = path.join(root, 'public');
  const appDir = path.join(root, 'src', 'app');

  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

  fs.writeFileSync(path.join(iconsDir, 'icon.svg'), standardSvg);
  fs.writeFileSync(path.join(iconsDir, 'maskable.svg'), maskableSvg);

  const standardBuf = Buffer.from(standardSvg);
  const maskableBuf = Buffer.from(maskableSvg);

  await sharp(standardBuf)
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'icon-512.png'));

  await sharp(standardBuf)
    .resize(192, 192)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'icon-192.png'));

  await sharp(standardBuf)
    .resize(180, 180)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'apple-touch-icon.png'));

  await sharp(maskableBuf)
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'maskable-512.png'));

  const favicon16 = await sharp(standardBuf).resize(16, 16).png().toBuffer();
  const favicon32 = await sharp(standardBuf).resize(32, 32).png().toBuffer();
  const favicon48 = await sharp(standardBuf).resize(48, 48).png().toBuffer();

  fs.writeFileSync(path.join(publicDir, 'favicon.png'), favicon48);

  const ico = createIco([
    { width: 16, height: 16, buffer: favicon16 },
    { width: 32, height: 32, buffer: favicon32 },
    { width: 48, height: 48, buffer: favicon48 },
  ]);
  fs.writeFileSync(path.join(appDir, 'favicon.ico'), ico);
  console.log('KCIC Fleet icons generated successfully.');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
