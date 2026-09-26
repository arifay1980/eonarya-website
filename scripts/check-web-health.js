#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const live = process.argv.includes('--live');
const baseUrl = 'https://eonarya.com';

const publicPages = new Map([
  ['index.html', 'https://eonarya.com/'],
  ['yardim.html', 'https://eonarya.com/yardim.html'],
  ['gizlilik.html', 'https://eonarya.com/gizlilik.html'],
  ['kullanim-sartlari.html', 'https://eonarya.com/kullanim-sartlari.html'],
  ['kvkk.html', 'https://eonarya.com/kvkk.html'],
  ['aydinlatma.html', 'https://eonarya.com/aydinlatma.html']
]);

const privatePages = [
  'bilgi.html',
  'mesaj.html',
  'onay.html',
  'onay-hatirlatma.html',
  'tercihler.html',
  'ucuncu-kisi-aydinlatma.html'
];

const errors = [];

function fail(message) { errors.push(message); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function metaTags(html) { return html.match(/<meta\b[^>]*>/gi) || []; }
function hasDescription(html) { return metaTags(html).some((tag) => /name=["']description["']/i.test(tag)); }
function hasNoindex(html) {
  return metaTags(html).some((tag) =>
    /name=["']robots["']/i.test(tag) && /content=["'][^"']*noindex/i.test(tag)
  );
}
function canonicalOf(html) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const tag = tags.find((item) => /rel=["']canonical["']/i.test(item));
  if (!tag) return null;
  const href = tag.match(/href=["']([^"']+)["']/i);
  return href ? href[1] : null;
}
function pageIds(html) {
  const ids = new Set();
  const re = /\sid=["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(html))) ids.add(match[1]);
  return ids;
}
function localTarget(href, currentFile) {
  if (!href || href === '#') return null;
  if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) return null;
  if (href.startsWith('#')) return { file: currentFile, anchor: href.slice(1) };

  const parsed = new URL(href, baseUrl + '/' + currentFile);
  if (parsed.origin !== baseUrl) return null;

  return {
    file: parsed.pathname === '/' ? 'index.html' : decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    anchor: parsed.hash ? decodeURIComponent(parsed.hash.slice(1)) : ''
  };
}

function checkSource() {
  const analyticsPath = path.join(root, 'assets', 'analytics.js');
  if (!fs.existsSync(analyticsPath)) {
    fail('assets/analytics.js eksik');
  } else {
    const analytics = fs.readFileSync(analyticsPath, 'utf8');
    if (!analytics.includes('G-GFHVXH40X5')) fail('GA4 ölçüm kimliği analytics.js içinde yok');
    privatePages.forEach((page) => {
      if (!analytics.includes("'/" + page + "'")) fail('Analitik özel sayfa koruması eksik: ' + page);
    });
  }

  for (const [file, expectedCanonical] of publicPages) {
    const html = read(file);
    if (!/<title>[^<]+<\/title>/i.test(html)) fail(file + ': title eksik');
    if (!hasDescription(html)) fail(file + ': meta description eksik');
    if (canonicalOf(html) !== expectedCanonical) fail(file + ': canonical hatalı veya eksik');
    if (!html.includes('/assets/analytics.js')) fail(file + ': analytics.js yüklenmiyor');
  }

  for (const file of privatePages) {
    const html = read(file);
    if (!hasNoindex(html)) fail(file + ': noindex eksik');
    if (html.includes('/assets/analytics.js') || /googletagmanager|gtag\(|clarity\.ms/i.test(html)) {
      fail(file + ': özel sayfada analitik/izleme kodu bulundu');
    }
  }

  const notFound = read('404.html');
  if (!hasNoindex(notFound)) fail('404.html: noindex eksik');
  if (/googletagmanager|gtag\(|\/assets\/analytics\.js|clarity\.ms/i.test(notFound)) {
    fail('404.html: bilinmeyen URL verisini sızdırabilecek analitik kod bulunmamalı');
  }

  const robots = read('robots.txt');
  privatePages.forEach((file) => {
    if (!robots.includes('Disallow: /' + file)) fail('robots.txt özel sayfayı engellemiyor: ' + file);
  });
  if (!robots.includes('Sitemap: https://eonarya.com/sitemap.xml')) fail('robots.txt sitemap adresi eksik');

  const sitemap = read('sitemap.xml');
  for (const canonical of publicPages.values()) {
    if (!sitemap.includes('<loc>' + canonical + '</loc>')) fail('sitemap eksik: ' + canonical);
  }
  privatePages.forEach((file) => {
    if (sitemap.includes('/' + file)) fail('sitemap özel sayfa içeriyor: ' + file);
  });
  if (sitemap.includes('/404.html')) fail('sitemap 404.html içermemeli');

  const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
  const cache = new Map(htmlFiles.map((file) => [file, read(file)]));
  const idCache = new Map(htmlFiles.map((file) => [file, pageIds(cache.get(file))]));

  for (const [file, html] of cache) {
    const hrefRe = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = hrefRe.exec(html))) {
      const target = localTarget(match[1], file);
      if (!target) continue;
      if (!cache.has(target.file)) {
        fail(file + ': kırık iç bağlantı -> ' + match[1]);
        continue;
      }
      if (target.anchor && !idCache.get(target.file).has(target.anchor)) {
        fail(file + ': bulunmayan anchor -> ' + match[1]);
      }
    }
  }
}

async function checkLive() {
  const urls = [
    ...Array.from(publicPages.values()),
    baseUrl + '/robots.txt',
    baseUrl + '/sitemap.xml',
    baseUrl + '/assets/analytics.js'
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': 'Eonarya-Site-Health/1.0' }
      });
      if (!response.ok) fail('LIVE ' + url + ': HTTP ' + response.status);
    } catch (error) {
      fail('LIVE ' + url + ': ' + error.message);
    }
  }

  for (const file of privatePages) {
    try {
      const response = await fetch(baseUrl + '/' + file, {
        redirect: 'follow',
        headers: { 'user-agent': 'Eonarya-Site-Health/1.0' }
      });
      const body = await response.text();
      if (!response.ok) fail('LIVE ' + file + ': HTTP ' + response.status);
      if (!hasNoindex(body)) fail('LIVE ' + file + ': noindex görünmüyor');
      if (body.includes('/assets/analytics.js') || /googletagmanager|gtag\(|clarity\.ms/i.test(body)) {
        fail('LIVE ' + file + ': özel sayfada analitik/izleme kodu var');
      }
    } catch (error) {
      fail('LIVE ' + file + ': ' + error.message);
    }
  }

  try {
    const response = await fetch(baseUrl + '/__eonarya-health-missing__', {
      redirect: 'manual',
      headers: { 'user-agent': 'Eonarya-Site-Health/1.0' }
    });
    if (response.status !== 404) fail('LIVE 404 davranışı beklenen 404 yerine HTTP ' + response.status);
  } catch (error) {
    fail('LIVE 404 kontrolü: ' + error.message);
  }
}

(async function main() {
  checkSource();
  if (live) await checkLive();

  if (errors.length) {
    console.error('Web sağlık kontrolü başarısız:');
    errors.forEach((error) => console.error('- ' + error));
    process.exitCode = 1;
    return;
  }

  console.log('✓ Web sağlık kontrolü başarılı' + (live ? ' (kaynak + canlı site)' : ' (kaynak)'));
})();
