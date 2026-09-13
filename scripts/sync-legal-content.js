#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const websiteRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(process.env.EONARYA_APP_ROOT || path.join(websiteRoot, '..', 'Eonarya'));
function requireFromEither(pkg) {
  try { return require(pkg); }
  catch { return require(path.join(appRoot, 'node_modules', pkg)); }
}
const parser = requireFromEither('@babel/parser');
const traverse = requireFromEither('@babel/traverse').default;
const contractsPath = path.join(appRoot, 'services', 'contracts.js');
const manifestPath = path.join(websiteRoot, 'generated', 'legal-parity-manifest.json');
const checkOnly = process.argv.includes('--check');

const mappings = [
  ['KULLANICI_SOZLESMESI', 'kullanim-sartlari.html'],
  ['GIZLILIK_POLITIKASI', 'gizlilik.html'],
  ['AYDINLATMA_METNI', 'aydinlatma.html'],
  ['UCUNCU_KISI_AYDINLATMA_METNI', 'ucuncu-kisi-aydinlatma.html'],
];

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function htmlEscape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function normalize(value) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
    .replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
}

function contractValues(source) {
  const ast = parser.parse(source, { sourceType: 'module' });
  const nodes = new Map();
  traverse(ast, { VariableDeclarator({ node }) { if (node.id.type === 'Identifier') nodes.set(node.id.name, node.init); } });
  const cache = new Map();
  function evaluate(name) {
    if (cache.has(name)) return cache.get(name);
    const node = nodes.get(name);
    if (!node && name === 'ILETISIM_EMAIL') {
      const uiSource = fs.readFileSync(path.join(appRoot, 'shared', 'uiSabitleri.js'), 'utf8');
      const match = uiSource.match(/export const ILETISIM_EMAIL\s*=\s*(['"])(.*?)\1/);
      if (!match) throw new Error('Canonical ILETISIM_EMAIL bulunamadı');
      cache.set(name, match[2]);
      return match[2];
    }
    if (!node) throw new Error(`Canonical sözleşme exportu bulunamadı: ${name}`);
    let value;
    if (node.type === 'StringLiteral') value = node.value;
    else if (node.type === 'TemplateLiteral') {
      value = node.quasis.map((part, index) => {
        const expression = node.expressions[index];
        if (!expression) return part.value.cooked;
        if (expression.type !== 'Identifier') throw new Error(`${name}: desteklenmeyen template ifadesi`);
        return part.value.cooked + evaluate(expression.name);
      }).join('');
    } else throw new Error(`${name}: canonical değer sabit metin değil`);
    cache.set(name, value);
    return value;
  }
  return evaluate;
}

function renderCanonicalMain(name, text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  lines.shift();
  const blocks = [];
  let bullets = [];
  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(`    <ul class="doc-bullets">\n${bullets.map((line) => `      <li>${htmlEscape(line)}</li>`).join('\n')}\n    </ul>`);
    bullets = [];
  };
  for (const line of lines) {
    if (!line) { flushBullets(); continue; }
    if (/^(?:-|•)\s/.test(line)) { bullets.push(line.replace(/^(?:-|•)\s/, '')); continue; }
    flushBullets();
    if (/^\d+\.\s/.test(line)) blocks.push(`  </div>\n\n  <div class="doc-section">\n    <h2 class="doc-section-title">${htmlEscape(line)}</h2>`);
    else if (line.endsWith(':') || line.endsWith(';') || /^(Kimlik bilgileri|İletişim bilgileri|Eonarya içindeki rol ve ilişki bilgileri|Teslimat ve işlem bilgileri|Hayattayım Protokolü kapsamında|Teknik ve güvenlik kayıtları|Mesaj ve içerik alıcısıysanız|Plan veya hatırlatma alıcısıysanız|Güvenilir Kişiyseniz|Onay Grubu üyesiyseniz|Tüm üçüncü kişiler bakımından)$/.test(line)) blocks.push(`    <p class="doc-sub">${htmlEscape(line)}</p>`);
    else blocks.push(`    <p class="doc-body">${htmlEscape(line)}</p>`);
  }
  flushBullets();
  const draft = name === 'UCUNCU_KISI_AYDINLATMA_METNI' && (text.includes('[MEVCUT CANONICAL VERİ SORUMLUSU ADI / TİCARİ UNVANI]') || text.includes('[MEVCUT CANONICAL ADRES]'));
  const banner = draft ? `
  <div class="draft-banner">
    <strong>Taslak — Hukuki Kimlik Bilgisi Bekleniyor</strong>
    Veri sorumlusunun tam adı/ticari unvanı ve adresi güncel canonical kaynaklarda bulunmadığı için bu metin production-ready değildir. Onaylı içerik uygulanmış, eksik kimlik alanları görünür biçimde korunmuştur.
  </div>\n` : '';
  const sections = blocks.join('\n').replace(/^  <\/div>\n\n/, '');
  return `<main class="content" data-legal-canonical="${name}">\n${banner}\n${sections}\n  </div>\n</main>`;
}

function assertCanonicalFragments(name, canonical, html) {
  const visible = normalize(html);
  const fragments = canonical.split(/\r?\n/)
    .map((line) => normalize(line).replace(/^[•*-]\s*/, ''))
    .filter((line, index) => index > 0 && line.length > 3);
  const missing = fragments.filter((fragment) => !visible.includes(fragment));
  if (missing.length) throw new Error(`${name} → website parity bozuk; eksik ilk parça: ${missing[0]}`);
}

function main() {
  const source = fs.readFileSync(contractsPath, 'utf8');
  const evaluate = contractValues(source);
  const entries = {};
  for (const [name, page] of mappings) {
    const canonical = evaluate(name).trim();
    const pagePath = path.join(websiteRoot, page);
    let html = fs.readFileSync(pagePath, 'utf8');
    let expectedHtml = html.replace(/<main class="content"[\s\S]*?<\/main>/, renderCanonicalMain(name, canonical));
    if (name === 'UCUNCU_KISI_AYDINLATMA_METNI') {
      const draft = canonical.includes('[MEVCUT CANONICAL VERİ SORUMLUSU ADI / TİCARİ UNVANI]') || canonical.includes('[MEVCUT CANONICAL ADRES]');
      const meta = `Eonarya Kullanıcısı Olmayan İlgili Kişiler İçin${draft ? ' · Taslak' : ''}`;
      expectedHtml = expectedHtml.replace(/<p class="page-hero-meta">[\s\S]*?<\/p>/, `<p class="page-hero-meta">${meta}</p>`);
    }
    if (html !== expectedHtml) {
      if (checkOnly) throw new Error(`${page} canonical çıktıdan saptı`);
      fs.writeFileSync(pagePath, expectedHtml, 'utf8');
      html = expectedHtml;
    }
    assertCanonicalFragments(name, canonical, html);
    entries[name] = { page, canonicalSha256: hash(canonical), pageVisibleTextSha256: hash(normalize(html)) };
  }
  const manifest = `${JSON.stringify({ schemaVersion: 1, source: 'Eonarya/services/contracts.js', entries }, null, 2)}\n`;
  const current = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : null;
  if (current !== manifest) {
    if (checkOnly) throw new Error('Hukuki parity manifesti güncel değil');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, manifest, 'utf8');
  }
  console.log(`✓ Hukuki içerik ${checkOnly ? 'parity içinde' : 'senkronize'} (${mappings.length} belge)`);
}

try { main(); } catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
