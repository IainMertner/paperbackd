#!/usr/bin/env node
// Generates PNG versions of all favicon SVGs for iOS/mobile fallback.
// Run from the reading-log directory: node generate-favicons.js
const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

const SVGS = ['favicon', 'favicon-a', 'favicon-b', 'favicon-c', 'favicon-f', 'favicon-l', 'favicon-n', 'favicon-s'];

async function main() {
  let Resvg;
  try {
    ({ Resvg } = require('@resvg/resvg-js'));
  } catch {
    console.log('Installing @resvg/resvg-js...');
    require('child_process').execSync('npm install --no-save @resvg/resvg-js', { stdio: 'inherit', cwd: BASE });
    ({ Resvg } = require('@resvg/resvg-js'));
  }

  // 32x32 per-letter PNGs
  for (const name of SVGS) {
    const svg = fs.readFileSync(path.join(BASE, `${name}.svg`), 'utf8');
    const png = new Resvg(svg, { width: 32, height: 32 }).render().asPng();
    fs.writeFileSync(path.join(BASE, `${name}.png`), png);
    console.log(`✓ ${name}.png`);
  }

  // 180x180 apple-touch-icon (always uses the p logo)
  const atSvg = fs.readFileSync(path.join(BASE, 'favicon.svg'), 'utf8');
  const atPng = new Resvg(atSvg, { width: 180, height: 180 }).render().asPng();
  fs.writeFileSync(path.join(BASE, 'apple-touch-icon.png'), atPng);
  console.log('✓ apple-touch-icon.png');

  // Update HTML files: insert PNG fallback + apple-touch-icon after existing SVG link
  const htmlFiles = fs.readdirSync(BASE, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(BASE, d.name, 'index.html'))
    .filter(f => fs.existsSync(f));
  htmlFiles.push(path.join(BASE, 'index.html'));

  for (const file of htmlFiles) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('type="image/png"')) { console.log(`- skipped ${path.relative(BASE, file)} (already has PNG link)`); continue; }
    if (!content.includes('type="image/svg+xml"')) { console.log(`- skipped ${path.relative(BASE, file)} (no SVG link)`); continue; }

    content = content.replace(
      /<link rel="icon" type="image\/svg\+xml" href="(\/favicon[^"]*\.svg)">/,
      (_, svgHref) => {
        const pngHref = svgHref.replace('.svg', '.png');
        return `<link rel="icon" type="image/svg+xml" href="${svgHref}">\n  <link rel="icon" type="image/png" href="${pngHref}">\n  <link rel="apple-touch-icon" href="/apple-touch-icon.png">`;
      }
    );

    fs.writeFileSync(file, content, 'utf8');
    console.log(`✓ updated ${path.relative(BASE, file)}`);
  }

  console.log('\nDone. Commit all new .png files and the updated HTML.');
}

main().catch(err => { console.error(err); process.exit(1); });
