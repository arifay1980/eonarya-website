#!/usr/bin/env node

// Hukuki sayfaların gövdesi kardeş Eonarya uygulama reposundaki tek düzenleme kaynağından
// (services/contracts.js) üretilir. Üretimden ÖNCE metin, uygulama reposundaki onaylı sürüm
// defteriyle (shared/content/hukukiSurumDefteri.json) ortak doğrulayıcı üzerinden karşılaştırılır:
// onaysız, eski veya aynı sürüm numarasıyla değiştirilmiş metin web'e yazılamaz. Ayrıca web'in
// daha önce yayımladığı sürümden geriye düşülemez (eski uygulama dalından üretim engeli).

const fs = require('node:fs');
const path = require('node:path');

const websiteRootVarsayilan = path.resolve(__dirname, '..');
const appRootVarsayilan = path.resolve(process.env.EONARYA_APP_ROOT || path.join(websiteRootVarsayilan, '..', 'Eonarya'));
const MANIFEST_GORELI = path.join('generated', 'legal-parity-manifest.json');
const SAYFA_ALT_BASLIKLARI = /^(Kimlik bilgileri|İletişim bilgileri|Eonarya içindeki rol ve ilişki bilgileri|Teslimat ve işlem bilgileri|Hayattayım Protokolü kapsamında|Teknik ve güvenlik kayıtları|Mesaj ve içerik alıcısıysanız|Plan veya hatırlatma alıcısıysanız|Güvenilir Kişiyseniz|Onay Grubu üyesiyseniz|Tüm üçüncü kişiler bakımından)$/;
const CEREZ_BAGLANTISI = '<a href="/cerez-politikasi.html">Çerez Politikası</a>';

// kvkk.html web'e özel bir bilgilendirme sayfasıdır; NFC hukuki açıklamasının ikinci kopyasını taşımaz.
// NFC bölümü merkezi Aydınlatma Metni ve Gizlilik Politikası'na, doğrulanmış güncel sürümleriyle yönlendiren
// üretilmiş bloktur. Blok dışında NFC teknik/hukuki iddiası bulunamaz.
const KVKK_SAYFASI = 'kvkk.html';
const KVKK_NFC_BASLANGIC = '<!-- GENERATED:KVKK-NFC:START -->';
const KVKK_NFC_BITIS = '<!-- GENERATED:KVKK-NFC:END -->';
const KVKK_NFC_YASAK_IFADELER = /NFC|DG1|EF\.SOD|MRZ|CSCA|CRL|\bSOD\b|kimlik kart/i;

function kvkkNfcBlogu(belgeler) {
  const aydinlatma = belgeler.AYDINLATMA_METNI.surum;
  const gizlilik = belgeler.GIZLILIK_POLITIKASI.surum;
  return `${KVKK_NFC_BASLANGIC}
  <!-- scripts/sync-legal-content.js üretir — ELLE DÜZENLEMEYİN. NFC hukuki açıklamasının tek kaynağı Aydınlatma Metni ve Gizlilik Politikası'dır. -->
  <div class="doc-section">
    <h2 class="doc-section-title">3. NFC Kimlik Eşleşmesi</h2>
    <p class="doc-body">NFC Kimlik Eşleşmesi kapsamında hangi verilerin okunduğu, sunucuya gönderildiği, geçici olarak işlendiği ve saklandığı ile bu işlemenin amacı ve hukuki sebebi yalnız Aydınlatma Metni'nde ve Gizlilik Politikası'nda açıklanır. Bu sayfa o açıklamayı tekrar etmez.</p>
    <p class="doc-body">Yürürlükteki sürümler: Aydınlatma Metni ${htmlEscape(aydinlatma)}, Gizlilik Politikası ${htmlEscape(gizlilik)}.</p>
    <a class="doc-link" href="/aydinlatma.html">Aydınlatma Metni'ni Aç</a>
    <a class="doc-link" href="/gizlilik.html">Gizlilik Politikası'nı Aç</a>
  </div>
  ${KVKK_NFC_BITIS}`;
}

function kvkkSayfasiniUret(html, belgeler) {
  const bas = html.indexOf(KVKK_NFC_BASLANGIC);
  const son = html.indexOf(KVKK_NFC_BITIS);
  if (bas === -1 || son === -1 || son < bas || html.indexOf(KVKK_NFC_BASLANGIC, bas + 1) !== -1) {
    throw new Error(`${KVKK_SAYFASI} → merkezi NFC bloğu işaretleri eksik veya hatalı`);
  }
  const hedef = html.slice(0, bas) + kvkkNfcBlogu(belgeler) + html.slice(son + KVKK_NFC_BITIS.length);
  const disarisi = (hedef.slice(0, hedef.indexOf(KVKK_NFC_BASLANGIC)) + hedef.slice(hedef.indexOf(KVKK_NFC_BITIS)))
    .replace(/<head\b[\s\S]*?<\/head>/i, ' ');
  const bulunan = normalize(disarisi).match(KVKK_NFC_YASAK_IFADELER);
  if (bulunan) throw new Error(`${KVKK_SAYFASI} → merkezi blok dışında bağımsız NFC açıklaması var ("${bulunan[0]}")`);
  return hedef;
}

function dogrulayiciYukle(appRoot) {
  const yol = path.join(appRoot, 'scripts', 'hukuki-surum-dogrulama.cjs');
  if (!fs.existsSync(yol)) {
    throw new Error(`Uygulama kaynağında hukuki sürüm doğrulayıcısı yok (${yol}). Eski bir uygulama dalından web üretilemez.`);
  }
  return require(yol);
}

const hash = (deger, dogrulama) => dogrulama.sha256(deger);

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

function taslakMi(name, text) {
  return name === 'UCUNCU_KISI_AYDINLATMA_METNI' && (text.includes('[MEVCUT CANONICAL VERİ SORUMLUSU ADI / TİCARİ UNVANI]') || text.includes('[MEVCUT CANONICAL ADRES]'));
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
  const renderInline = (line) => {
    const escaped = htmlEscape(line);
    if (name !== 'GIZLILIK_POLITIKASI' || !line.includes('Çerez Politikası incelenebilir.')) return escaped;
    return escaped.replace('Çerez Politikası', CEREZ_BAGLANTISI);
  };
  for (const line of lines) {
    if (!line) { flushBullets(); continue; }
    if (/^(?:-|•)\s/.test(line)) { bullets.push(line.replace(/^(?:-|•)\s/, '')); continue; }
    flushBullets();
    if (/^\d+\.\s/.test(line)) blocks.push(`  </div>\n\n  <div class="doc-section">\n    <h2 class="doc-section-title">${htmlEscape(line)}</h2>`);
    else if (line.endsWith(':') || line.endsWith(';') || SAYFA_ALT_BASLIKLARI.test(line)) blocks.push(`    <p class="doc-sub">${htmlEscape(line)}</p>`);
    else blocks.push(`    <p class="doc-body">${renderInline(line)}</p>`);
  }
  flushBullets();
  const banner = taslakMi(name, text) ? `
  <div class="draft-banner">
    <strong>Taslak — Hukuki Kimlik Bilgisi Bekleniyor</strong>
    Veri sorumlusunun tam adı/ticari unvanı ve adresi güncel canonical kaynaklarda bulunmadığı için bu metin production-ready değildir. Onaylı içerik uygulanmış, eksik kimlik alanları görünür biçimde korunmuştur.
  </div>\n` : '';
  const sections = blocks.join('\n').replace(/^  <\/div>\n\n/, '');
  return `<main class="content" data-legal-canonical="${name}">\n${banner}\n${sections}\n  </div>\n</main>`;
}

// Git, Windows checkout'unda (core.autocrlf) satır sonlarını CRLF'ye çevirir; repodaki blob LF'dir. Parity
// karşılaştırması yalnız satır sonu farkını yok sayar, içerik farkını her zaman yakalar.
const satirSonuNormal = (metin) => metin.replace(/\r\n/g, '\n');
const farkliMi = (a, b) => satirSonuNormal(a) !== satirSonuNormal(b);

function beklenenSayfa(name, canonical, html) {
  let expectedHtml = html.replace(/<main class="content"[\s\S]*?<\/main>/, renderCanonicalMain(name, canonical));
  if (name === 'UCUNCU_KISI_AYDINLATMA_METNI') {
    const meta = `Eonarya Kullanıcısı Olmayan İlgili Kişiler İçin${taslakMi(name, canonical) ? ' · Taslak' : ''}`;
    expectedHtml = expectedHtml.replace(/<p class="page-hero-meta">[\s\S]*?<\/p>/, `<p class="page-hero-meta">${meta}</p>`);
  }
  return expectedHtml;
}

// Sayfa, onaylı metnin her satırını ve zorunlu bağlantıları görünür biçimde içermek zorundadır.
function sayfaIceriginiDogrula(name, canonical, html) {
  const visible = normalize(html);
  const fragments = canonical.split(/\r?\n/)
    .map((line) => normalize(line).replace(/^[•*-]\s*/, ''))
    .filter((line, index) => index > 0 && line.length > 3);
  const missing = fragments.filter((fragment) => !visible.includes(fragment));
  if (missing.length) throw new Error(`${name} → website parity bozuk; eksik ilk parça: ${missing[0]}`);
  if (canonical.includes('Çerez Politikası incelenebilir.') && !html.includes(CEREZ_BAGLANTISI)) {
    throw new Error(`${name} → zorunlu Çerez Politikası bağlantısı eksik`);
  }
}

// Web'in daha önce yayımladığı sürüm, uygulama defterine göre yeni üretimden daha ileri olamaz;
// aynı sürüm farklı içerikle yeniden yayımlanamaz.
function yayinGecmisiniKoru({ dogrulama, defter, eskiManifest, belgeler }) {
  const hatalar = [];
  for (const [name, eski] of Object.entries(eskiManifest?.entries ?? {})) {
    const yeni = belgeler[name];
    if (!yeni) continue;
    const kayitlar = defter.belgeler[name]?.onayliSurumler ?? [];
    const eskiSurum = eski.version ?? kayitlar.find((s) => s.sha256 === eski.canonicalSha256)?.surum;
    if (!eskiSurum || dogrulama.surumSirasi(defter, name, eskiSurum) === -1) {
      hatalar.push(`${name}: web'de yayımlı sürüm (${eskiSurum ?? eski.canonicalSha256?.slice(0, 12)}) uygulama defterinde yok; uygulama kaynağı eski bir dal olabilir`);
      continue;
    }
    if (dogrulama.surumSirasi(defter, name, yeni.surum) < dogrulama.surumSirasi(defter, name, eskiSurum)) {
      hatalar.push(`${name}: web ${eskiSurum} yayımlıyor; ${yeni.surum} ile geriye düşülemez`);
    }
    if (eskiSurum === yeni.surum && eski.canonicalSha256 !== yeni.sha256) {
      hatalar.push(`${name}: ${eskiSurum} sürümü web'de farklı içerikle kayıtlı`);
    }
  }
  return hatalar;
}

function senkronize({
  websiteRoot = websiteRootVarsayilan,
  appRoot = appRootVarsayilan,
  checkOnly = false,
  only = null,
  kaynakMetni = null,
  defter: defterGirdisi = null,
} = {}) {
  const dogrulama = dogrulayiciYukle(appRoot);
  const defter = defterGirdisi ?? dogrulama.defteriOku(appRoot);
  const { belgeler, hatalar } = dogrulama.yayinDurumunuDogrula({ defter, degerOku: dogrulama.hukukiMetinleriOku(appRoot, kaynakMetni) });
  if (hatalar.length) throw new Error(`Onaylı sürüm doğrulaması başarısız — web üretilmedi:\n  - ${hatalar.join('\n  - ')}`);

  const mappings = Object.entries(defter.belgeler).filter(([, k]) => k.webSayfasi).map(([name, k]) => [name, k.webSayfasi]);
  const selectedMappings = only ? mappings.filter(([name]) => name === only) : mappings;
  if (only && selectedMappings.length === 0) throw new Error(`Bilinmeyen hukuki belge: ${only}`);

  const manifestPath = path.join(websiteRoot, MANIFEST_GORELI);
  const eskiManifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  const gecmisHatalari = yayinGecmisiniKoru({ dogrulama, defter, eskiManifest, belgeler });
  if (gecmisHatalari.length) throw new Error(`Web yayın geçmişi korunuyor — web üretilmedi:\n  - ${gecmisHatalari.join('\n  - ')}`);

  // Önce bütün sayfalar bellekte üretilir ve doğrulanır; yalnız hepsi geçerse diske yazılır.
  const yazilacaklar = [];
  const updatedEntries = {};
  for (const [name, page] of mappings) {
    const pagePath = path.join(websiteRoot, page);
    const html = fs.readFileSync(pagePath, 'utf8');
    const secili = selectedMappings.some(([n]) => n === name);
    const hedef = secili ? beklenenSayfa(name, belgeler[name].metin, html) : html;
    if (secili && farkliMi(hedef, html)) {
      if (checkOnly) throw new Error(`${page} canonical çıktıdan saptı`);
      yazilacaklar.push([pagePath, hedef]);
    }
    if (secili) sayfaIceriginiDogrula(name, belgeler[name].metin, hedef);
    updatedEntries[name] = secili
      ? { page, version: belgeler[name].surum, canonicalSha256: belgeler[name].sha256, pageVisibleTextSha256: hash(normalize(hedef), dogrulama) }
      : eskiManifest?.entries?.[name];
    if (!updatedEntries[name]) throw new Error(`Hukuki parity manifest kaydı eksik: ${name}`);
  }
  const kvkkYolu = path.join(websiteRoot, KVKK_SAYFASI);
  const kvkkHtml = fs.readFileSync(kvkkYolu, 'utf8');
  const kvkkHedef = kvkkSayfasiniUret(kvkkHtml, belgeler);
  if (farkliMi(kvkkHedef, kvkkHtml)) {
    if (checkOnly) throw new Error(`${KVKK_SAYFASI} merkezi NFC bloğu güncel onaylı sürümlerden saptı`);
    yazilacaklar.push([kvkkYolu, kvkkHedef]);
  }
  const manifest = `${JSON.stringify({ schemaVersion: 2, source: 'Eonarya/services/contracts.js', ledger: 'Eonarya/shared/content/hukukiSurumDefteri.json', entries: updatedEntries }, null, 2)}\n`;
  const current = eskiManifest ? fs.readFileSync(manifestPath, 'utf8') : null;
  if (current === null || farkliMi(current, manifest)) {
    if (checkOnly) throw new Error('Hukuki parity manifesti güncel değil (sürüm/hash kaydı uygulamayla aynı değil)');
    yazilacaklar.push([manifestPath, manifest]);
  }
  for (const [dosya, icerik] of yazilacaklar) {
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    fs.writeFileSync(dosya, icerik, 'utf8');
  }
  return { belgeler: Object.fromEntries(Object.entries(belgeler).map(([n, b]) => [n, b.surum])), yazilan: yazilacaklar.length, secilen: selectedMappings.length };
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const index = process.argv.indexOf('--only');
  const only = index === -1 ? null : process.argv[index + 1];
  const sonuc = senkronize({ checkOnly, only });
  const surumler = Object.entries(sonuc.belgeler).map(([n, s]) => `${n} ${s}`).join(', ');
  console.log(`✓ Hukuki içerik ${checkOnly ? 'parity içinde' : 'senkronize'} (${sonuc.secilen} web belgesi; doğrulanan onaylı sürümler: ${surumler})`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { senkronize, normalize, renderCanonicalMain, CEREZ_BAGLANTISI, MANIFEST_GORELI };
