// Hukuki metin üretiminin onaylı sürüm korumaları. Her negatif test, gerçek sayfaların geçici
// bir kopyası üzerinde çalışır; gerçek repo dosyaları değişmez. Uygulama reposu
// (EONARYA_APP_ROOT veya ../Eonarya) onaylı sürüm defterinin ve tek metin kaynağının sahibidir.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { senkronize, CEREZ_BAGLANTISI, MANIFEST_GORELI } = require('../scripts/sync-legal-content.js');

const websiteRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(process.env.EONARYA_APP_ROOT || path.join(websiteRoot, '..', 'Eonarya'));
const contractsKaynagi = fs.readFileSync(path.join(appRoot, 'services', 'contracts.js'), 'utf8');
const dogrulama = require(path.join(appRoot, 'scripts', 'hukuki-surum-dogrulama.cjs'));
const defter = dogrulama.defteriOku(appRoot);
const SAYFALAR = [...Object.values(defter.belgeler).map((k) => k.webSayfasi).filter(Boolean), 'kvkk.html'];

function geciciSite() {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'eonarya-legal-'));
  fs.mkdirSync(path.join(kok, 'generated'));
  for (const sayfa of SAYFALAR) fs.copyFileSync(path.join(websiteRoot, sayfa), path.join(kok, sayfa));
  fs.copyFileSync(path.join(websiteRoot, MANIFEST_GORELI), path.join(kok, MANIFEST_GORELI));
  return kok;
}
const durum = (kok) => Object.fromEntries([...SAYFALAR, MANIFEST_GORELI].map((f) => [f, fs.readFileSync(path.join(kok, f), 'utf8')]));
const manifestDuzenle = (kok, degistir) => {
  const yol = path.join(kok, MANIFEST_GORELI);
  const m = JSON.parse(fs.readFileSync(yol, 'utf8'));
  degistir(m);
  fs.writeFileSync(yol, `${JSON.stringify(m, null, 2)}\n`);
};

test('gerçek repo: web sayfaları ve manifest uygulamanın onaylı güncel sürümleriyle aynı', () => {
  const sonuc = senkronize({ websiteRoot, appRoot, checkOnly: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(websiteRoot, MANIFEST_GORELI), 'utf8'));
  for (const [ad, kayit] of Object.entries(defter.belgeler).filter(([, k]) => k.webSayfasi)) {
    const son = kayit.onayliSurumler.at(-1);
    assert.equal(sonuc.belgeler[ad], son.surum);
    assert.equal(manifest.entries[ad].version, son.surum);
    assert.equal(manifest.entries[ad].canonicalSha256, son.sha256);
  }
});

test('1/7 — eski veya değiştirilmiş kaynaktan web üretilemez; sayfa kendi kaynağıyla eşleşse bile PASS yok', () => {
  const kok = geciciSite();
  const once = durum(kok);
  const bozuk = contractsKaynagi.replace('Kişisel veriler, bu amaçlarla bağlantılı olmayan işlemlerde kullanılmaz.', 'Kişisel veriler başka amaçlarla da kullanılabilir.');
  assert.notEqual(bozuk, contractsKaynagi);
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot, kaynakMetni: bozuk }), /onaylı metni değiştirilmiş/);
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot, kaynakMetni: bozuk, checkOnly: true }), /onaylı metni değiştirilmiş/);
  assert.deepEqual(durum(kok), once, 'reddedilen üretim hiçbir dosyaya yazmamalı');
});

test('1 — sürüm sabiti olmayan eski uygulama dalından web üretilemez', () => {
  const kok = geciciSite();
  const eski = contractsKaynagi.replace(/export const GIZLILIK_POLITIKASI_VERSIYON = '[^']+';/, '');
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot, kaynakMetni: eski }), /GIZLILIK_POLITIKASI_VERSIYON/);
});

test('2 — web daha yeni bir sürüm yayımlıyorsa eski uygulama kaynağı onu ezemez', () => {
  const kok = geciciSite();
  manifestDuzenle(kok, (m) => { m.entries.GIZLILIK_POLITIKASI.version = '9.9'; });
  const once = durum(kok);
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot }), /GIZLILIK_POLITIKASI: web'de yayımlı sürüm \(9\.9\) uygulama defterinde yok/);
  assert.deepEqual(durum(kok), once);
});

test('2 — defter daha yeni onaylı sürüm biliyorsa eski sürümlü kaynak web\'e yazılamaz', () => {
  const kok = geciciSite();
  const sahteDefter = JSON.parse(JSON.stringify(defter));
  const kayitlar = sahteDefter.belgeler.AYDINLATMA_METNI.onayliSurumler;
  kayitlar.push({ surum: '1.4', sha256: 'f'.repeat(64) });
  manifestDuzenle(kok, (m) => { m.entries.AYDINLATMA_METNI.version = '1.4'; });
  // Kaynak 1.3'ü onaylı son sürüm sanan eski defterle değil, 1.4'ü bilen defterle çalışır:
  // kaynak 1.3 taşıdığı için önce kaynak doğrulaması durdurur.
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot, defter: sahteDefter }), /eski onaylı sürüm 1\.3 taşıyor; güncel onaylı sürüm 1\.4/);
});

test('2 — uygulama ile web farklı sürüm gösterirse --check başarısız', () => {
  const kok = geciciSite();
  manifestDuzenle(kok, (m) => { m.entries.KULLANICI_SOZLESMESI.version = '1.0'; m.entries.KULLANICI_SOZLESMESI.canonicalSha256 = defter.belgeler.KULLANICI_SOZLESMESI.onayliSurumler[0].sha256; });
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot, checkOnly: true }), /manifesti güncel değil/);
});

test('3 — aynı sürüm numarası web\'de farklı içerikle kayıtlıysa üretim durur', () => {
  const kok = geciciSite();
  manifestDuzenle(kok, (m) => { m.entries.AYDINLATMA_METNI.canonicalSha256 = '0'.repeat(64); });
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot }), /AYDINLATMA_METNI: 1\.3 sürümü web'de farklı içerikle kayıtlı/);
});

test('5 — sayfadan hukuki paragraf eksilirse --check başarısız', () => {
  const kok = geciciSite();
  const yol = path.join(kok, 'aydinlatma.html');
  const html = fs.readFileSync(yol, 'utf8');
  const kirpik = html.replace(/\s*<p class="doc-body">[^<]*KVKK m\.5\/2-f[^<]*<\/p>/, '');
  assert.notEqual(kirpik, html);
  fs.writeFileSync(yol, kirpik);
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot, checkOnly: true }), /aydinlatma\.html canonical çıktıdan saptı/);
});

test('5 — Çerez Politikası bağlantısı kaldırılırsa --check başarısız', () => {
  const kok = geciciSite();
  const yol = path.join(kok, 'gizlilik.html');
  const html = fs.readFileSync(yol, 'utf8');
  assert.ok(html.includes(CEREZ_BAGLANTISI));
  fs.writeFileSync(yol, html.replace(CEREZ_BAGLANTISI, 'Çerez Politikası'));
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot, checkOnly: true }), /gizlilik\.html canonical çıktıdan saptı/);
});

test('onaylı kaynakla yeniden üretim bozulmuş sayfayı onarır ve sonuç --check geçer', () => {
  const kok = geciciSite();
  const yol = path.join(kok, 'gizlilik.html');
  fs.writeFileSync(yol, fs.readFileSync(yol, 'utf8').replace(CEREZ_BAGLANTISI, 'Çerez Politikası'));
  senkronize({ websiteRoot: kok, appRoot });
  assert.ok(fs.readFileSync(yol, 'utf8').includes(CEREZ_BAGLANTISI));
  senkronize({ websiteRoot: kok, appRoot, checkOnly: true });
});

test('web betikleri yayımlanmamış hukuki taslakları okumaz', () => {
  const iceAktarma = /(require\(\s*|from\s+|import\(\s*)[^)\n]*hukukiMetinTaslaklari/;
  const betikler = fs.readdirSync(path.join(websiteRoot, 'scripts')).filter((d) => /\.(c|m)?js$/.test(d));
  assert.ok(betikler.includes('sync-legal-content.js'));
  for (const dosya of betikler) {
    assert.ok(!iceAktarma.test(fs.readFileSync(path.join(websiteRoot, 'scripts', dosya), 'utf8')), dosya);
  }
});

// kvkk.html — NFC hukuki açıklamasının ikinci bağımsız kopyası bulunmaz; bölüm merkezi metinlere doğrulanmış
// güncel sürümleriyle yönlendiren üretilmiş bloktur.
const KVKK_BAS = '<!-- GENERATED:KVKK-NFC:START -->';
const KVKK_SON = '<!-- GENERATED:KVKK-NFC:END -->';
const kvkkOku = (kok) => fs.readFileSync(path.join(kok, 'kvkk.html'), 'utf8');
const kvkkYaz = (kok, html) => fs.writeFileSync(path.join(kok, 'kvkk.html'), html);

test('kvkk.html: NFC bölümü merkezi blok; güncel onaylı sürümleri gösterir, eski bağımsız NFC metni yok', () => {
  const html = kvkkOku(websiteRoot);
  const blok = html.slice(html.indexOf(KVKK_BAS), html.indexOf(KVKK_SON));
  const son = (ad) => defter.belgeler[ad].onayliSurumler.at(-1).surum;
  assert.ok(blok.includes(`Aydınlatma Metni ${son('AYDINLATMA_METNI')}, Gizlilik Politikası ${son('GIZLILIK_POLITIKASI')}`));
  assert.ok(blok.includes('href="/aydinlatma.html"') && blok.includes('href="/gizlilik.html"'));
  for (const eski of ['DG1', 'EF.SOD', 'CSCA', 'CRL', 'Strong NFC', 'm.5/2-f']) assert.ok(!html.includes(eski), eski);
});

test("6 — kvkk.html'de blok dışında bağımsız eski NFC açıklaması kalırsa üretim ve kontrol durur", () => {
  const kok = geciciSite();
  const html = kvkkOku(kok);
  kvkkYaz(kok, html.replace('<h2 class="doc-section-title">4.', '<p class="doc-body">Strong NFC sırasında DG1 ve EF.SOD sunucuda geçici işlenir.</p>\n    <h2 class="doc-section-title">4.'));
  const once = durum(kok);
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot, checkOnly: true }), /merkezi blok dışında bağımsız NFC açıklaması var/);
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot }), /merkezi blok dışında bağımsız NFC açıklaması var/);
  assert.deepEqual(durum(kok), once);
});

test('7 — kvkk.html bloğundaki sürüm merkezden ayrışırsa --check başarısız, yeniden üretim onarır', () => {
  const kok = geciciSite();
  kvkkYaz(kok, kvkkOku(kok).replace(/Aydınlatma Metni 1\.3,/, 'Aydınlatma Metni 1.2,'));
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot, checkOnly: true }), /kvkk\.html merkezi NFC bloğu güncel onaylı sürümlerden saptı/);
  senkronize({ websiteRoot: kok, appRoot });
  assert.ok(kvkkOku(kok).includes('Aydınlatma Metni 1.3,'));
  senkronize({ websiteRoot: kok, appRoot, checkOnly: true });
});

test('kvkk.html bloğu elle silinir veya işaret bozulursa üretim durur', () => {
  const kok = geciciSite();
  kvkkYaz(kok, kvkkOku(kok).replace(KVKK_BAS, ''));
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot, checkOnly: true }), /merkezi NFC bloğu işaretleri eksik/);
});

test("v1.4 taslağı hiçbir web sayfasında görünmez ve web'i etkinleştiremez", () => {
  const TASLAK_CUMLESI = 'Standart NFC Kimlik Eşleşmesinde uygulama';
  const taslakKaynagi = fs.readFileSync(path.join(appRoot, 'services', 'hukukiMetinTaslaklari.js'), 'utf8');
  assert.ok(taslakKaynagi.includes(TASLAK_CUMLESI), 'taslağın ayırt edici cümlesi bulunamadı');
  for (const sayfa of fs.readdirSync(websiteRoot).filter((d) => d.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(websiteRoot, sayfa), 'utf8');
    assert.ok(!html.includes(TASLAK_CUMLESI), sayfa);
    assert.ok(!/Aydınlatma Metni 1\.4|Gizlilik Politikası 1\.4/.test(html), sayfa);
  }
  const kok = geciciSite();
  const taslakSurumlu = contractsKaynagi.replace("AYDINLATMA_METNI_VERSIYON = '1.3'", "AYDINLATMA_METNI_VERSIYON = '1.4'");
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot, kaynakMetni: taslakSurumlu }), /1\.4 onaylı sürüm defterinde yok/);
});

test('Windows CRLF checkout\'u yalnız satır sonu yüzünden sahte FAIL vermez; CRLF dosyada içerik değişikliği yine yakalanır', () => {
  const kok = geciciSite();
  for (const dosya of [...SAYFALAR, MANIFEST_GORELI]) {
    const yol = path.join(kok, dosya);
    fs.writeFileSync(yol, fs.readFileSync(yol, 'utf8').replace(/\r?\n/g, '\r\n'));
  }
  const once = durum(kok);
  senkronize({ websiteRoot: kok, appRoot, checkOnly: true });
  senkronize({ websiteRoot: kok, appRoot });
  assert.deepEqual(durum(kok), once, 'yalnız satır sonu farkı için dosya yeniden yazılmamalı');
  const yol = path.join(kok, 'gizlilik.html');
  fs.writeFileSync(yol, fs.readFileSync(yol, 'utf8').replace('KVKK m.5/2-f', 'KVKK m.5/2-e'));
  assert.throws(() => senkronize({ websiteRoot: kok, appRoot, checkOnly: true }), /gizlilik\.html canonical çıktıdan saptı/);
});
