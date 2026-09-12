#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const websiteRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(process.env.EONARYA_APP_ROOT || path.join(websiteRoot, '..', 'Eonarya'));
const checkOnly = process.argv.includes('--check');
const sharp = require(path.join(appRoot, 'node_modules', 'sharp'));

const source = {
  tokens: path.join(appRoot, 'supabase', 'functions', '_shared', 'experience', 'design-tokens.json'),
  content: path.join(appRoot, 'supabase', 'functions', '_shared', 'experience', 'content.json'),
};

const targets = {
  css: path.join(websiteRoot, 'assets', 'experience-tokens.css'),
  content: path.join(websiteRoot, 'generated', 'experience-content.js'),
  manifest: path.join(websiteRoot, 'generated', 'experience-manifest.json'),
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function textBuffer(value) {
  return Buffer.from(`${value.trimEnd()}\n`, 'utf8');
}

function cssName(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function buildCss(tokens) {
  const lines = [':root {'];
  for (const [name, value] of Object.entries(tokens.colors)) {
    lines.push(`  --eon-color-${cssName(name)}: ${value};`);
  }
  for (const [name, value] of Object.entries(tokens.spacing)) {
    lines.push(`  --eon-space-${name}: ${value}px;`);
  }
  for (const [name, value] of Object.entries(tokens.radius)) {
    lines.push(`  --eon-radius-${name}: ${value}px;`);
  }
  lines.push(`  --eon-font-family: ${tokens.fontFamily};`);
  lines.push(`  --eon-public-max: ${tokens.layout.publicMax}px;`);
  lines.push(`  --eon-private-max: ${tokens.layout.privateMax}px;`);
  lines.push(`  --eon-control-height: ${tokens.control.height}px;`);
  lines.push('}');
  return textBuffer(lines.join('\n'));
}

function assertOrWrite(file, buffer) {
  const current = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (current?.equals(buffer)) return;
  if (checkOnly) throw new Error(`Senkron dışı çıktı: ${path.relative(websiteRoot, file)}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
}

async function resizedPng(sourcePath, width) {
  return sharp(sourcePath)
    .resize({ width, withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toBuffer();
}

async function main() {
  const tokensRaw = fs.readFileSync(source.tokens);
  const contentRaw = fs.readFileSync(source.content);
  const tokens = readJson(source.tokens);
  const content = readJson(source.content);

  const generated = new Map();
  generated.set(targets.css, buildCss(tokens));
  generated.set(
    targets.content,
    textBuffer(`window.EONARYA_EXPERIENCE = Object.freeze(${JSON.stringify(content, null, 2)});`),
  );

  const logoJobs = [
    ['assets/brand/logo-dark.png', 'assets/branding/logos/logo-yatay-o-slogansiz-siyah.png', 720],
    ['assets/brand/logo-light.png', 'assets/branding/logos/logo-yatay-o-slogansiz-beyaz.png', 720],
    ['assets/brand/symbol-dark.png', 'assets/branding/symbols/symbol-dark.png', 192],
    ['assets/email/header-logo.png', 'assets/branding/logos/logo-yatay-o-siyah.png', 602],
    ['assets/email/footer-logo.png', 'assets/branding/logos/logo-yatay-o-slogansiz-siyah.png', 602],
  ];

  for (const [targetRelative, sourceRelative, width] of logoJobs) {
    const targetPath = path.join(websiteRoot, targetRelative);
    const sourcePath = path.join(appRoot, sourceRelative);
    generated.set(targetPath, await resizedPng(sourcePath, width));
  }

  const manifest = {
    schemaVersion: 1,
    designVersion: tokens.version,
    contentVersion: content.version,
    sources: {
      designTokensSha256: hash(tokensRaw),
      contentSha256: hash(contentRaw),
    },
    outputs: Object.fromEntries(
      [...generated.entries()]
        .map(([file, buffer]) => [path.relative(websiteRoot, file).replace(/\\/g, '/'), hash(buffer)])
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  generated.set(targets.manifest, textBuffer(JSON.stringify(manifest, null, 2)));

  for (const [file, buffer] of generated) assertOrWrite(file, buffer);
  console.log(`✓ Deneyim kaynakları ${checkOnly ? 'güncel' : 'senkronize'} (${generated.size} çıktı)`);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
});
