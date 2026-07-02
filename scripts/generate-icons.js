const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// SVG definition for standard icons (with beautiful rounded corners/card style)
const svgStandard = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#311042" />
    </linearGradient>
    
    <!-- Gold Gradient for CA Monogram -->
    <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>

    <!-- Teal/Indigo Gradient for Accents -->
    <linearGradient id="accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#4f46e5" />
    </linearGradient>
    
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="10" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background Rect -->
  <rect width="512" height="512" rx="112" fill="url(#bg-grad)"/>

  <!-- Hexagonal background grid/patterns for technical feel -->
  <polygon points="256,60 416,152 416,336 256,428 96,336 96,152" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2"/>
  <polygon points="256,80 398,162 398,326 256,408 114,326 114,162" fill="none" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>

  <!-- Glowing Emblem Circle/Shield -->
  <circle cx="256" cy="248" r="160" fill="none" stroke="url(#accent-grad)" stroke-width="8" stroke-dasharray="8 4" opacity="0.3" filter="url(#glow)"/>
  <circle cx="256" cy="248" r="144" fill="none" stroke="url(#gold-grad)" stroke-width="2" opacity="0.15"/>

  <!-- Stylized "C" and "A" Monogram -->
  <g transform="translate(0, -8)" filter="url(#glow)">
    <!-- Letter C -->
    <path d="M 230 170 
             C 160 170, 145 220, 145 256 
             C 145 292, 160 342, 230 342 
             C 275 342, 290 320, 295 305" 
          fill="none" 
          stroke="url(#accent-grad)" 
          stroke-width="28" 
          stroke-linecap="round" 
          stroke-linejoin="round"/>
          
    <!-- Letter A -->
    <path d="M 285 342
             L 325 170
             L 365 342
             M 300 280
             L 350 280"
          fill="none"
          stroke="url(#gold-grad)"
          stroke-width="26"
          stroke-linecap="round"
          stroke-linejoin="round"/>
  </g>
  
  <!-- Subtle Balance Scale or Stars representing Chartered status -->
  <g transform="translate(256, 125)">
    <!-- Diamond spark -->
    <polygon points="0,-12 4,0 0,12 -4,0" fill="#fbbf24"/>
  </g>
  <g transform="translate(196, 135)">
    <polygon points="0,-8 3,0 0,8 -3,0" fill="#38bdf8" opacity="0.7"/>
  </g>
  <g transform="translate(316, 135)">
    <polygon points="0,-8 3,0 0,8 -3,0" fill="#38bdf8" opacity="0.7"/>
  </g>
</svg>
`;

// SVG definition for maskable icons (full square backdrop, with content scaled down for safe-zone)
const svgMaskable = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#311042" />
    </linearGradient>
    
    <!-- Gold Gradient for CA Monogram -->
    <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>

    <!-- Teal/Indigo Gradient for Accents -->
    <linearGradient id="accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#4f46e5" />
    </linearGradient>
    
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Full Square Background (Necessary for PWA Maskable) -->
  <rect width="512" height="512" fill="url(#bg-grad)"/>

  <!-- Content scaled slightly down (0.85 scale around center 256,256) to ensure it is in the safe zone -->
  <g transform="translate(38.4, 38.4) scale(0.85)">
    <!-- Hexagonal background grid/patterns for technical feel -->
    <polygon points="256,60 416,152 416,336 256,428 96,336 96,152" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2"/>
    <polygon points="256,80 398,162 398,326 256,408 114,326 114,162" fill="none" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>

    <!-- Glowing Emblem Circle/Shield -->
    <circle cx="256" cy="248" r="160" fill="none" stroke="url(#accent-grad)" stroke-width="8" stroke-dasharray="8 4" opacity="0.3" filter="url(#glow)"/>
    <circle cx="256" cy="248" r="144" fill="none" stroke="url(#gold-grad)" stroke-width="2" opacity="0.15"/>

    <!-- Stylized "C" and "A" Monogram -->
    <g transform="translate(0, -8)" filter="url(#glow)">
      <!-- Letter C -->
      <path d="M 230 170 
               C 160 170, 145 220, 145 256 
               C 145 292, 160 342, 230 342 
               C 275 342, 290 320, 295 305" 
            fill="none" 
            stroke="url(#accent-grad)" 
            stroke-width="28" 
            stroke-linecap="round" 
            stroke-linejoin="round"/>
            
      <!-- Letter A -->
      <path d="M 285 342
               L 325 170
               L 365 342
               M 300 280
               L 350 280"
            fill="none"
            stroke="url(#gold-grad)"
            stroke-width="26"
            stroke-linecap="round"
            stroke-linejoin="round"/>
    </g>
    
    <!-- Subtle Balance Scale or Stars representing Chartered status -->
    <g transform="translate(256, 125)">
      <!-- Diamond spark -->
      <polygon points="0,-12 4,0 0,12 -4,0" fill="#fbbf24"/>
    </g>
    <g transform="translate(196, 135)">
      <polygon points="0,-8 3,0 0,8 -3,0" fill="#38bdf8" opacity="0.7"/>
    </g>
    <g transform="translate(316, 135)">
      <polygon points="0,-8 3,0 0,8 -3,0" fill="#38bdf8" opacity="0.7"/>
    </g>
  </g>
</svg>
`;

async function generate() {
  const publicDir = path.join(__dirname, '../public');
  
  console.log('Generating PWA icons with sharp...');

  // 1. Generate icon-512.png (512x512 standard)
  await sharp(Buffer.from(svgStandard))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('Generated icon-512.png successfully.');

  // 2. Generate icon-192.png (192x192 standard)
  await sharp(Buffer.from(svgStandard))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('Generated icon-192.png successfully.');

  // 3. Generate icon-maskable-512.png (512x512 maskable)
  await sharp(Buffer.from(svgMaskable))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-maskable-512.png'));
  console.log('Generated icon-maskable-512.png successfully.');

  console.log('All PWA icons generated and placed in public/ successfully!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
