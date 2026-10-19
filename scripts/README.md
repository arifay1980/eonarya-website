# Senkronizasyon script'leri

Bu klasördeki script'ler, `eonarya.com`'un elle iki kez düzenlenmesini gerektiren
içeriklerini (Yardım Merkezi ve hukuki metinler) kardeş **Eonarya** uygulama
reposundaki tek (canonical) kaynaktan üretir. İnsan yalnız uygulama reposundaki
kaynağı düzenler; buradaki çıktılar **GENERATED — DO NOT EDIT** olarak işaretlenir
ve script yeniden çalıştırıldığında üzerine yazılır.

## Ön koşul

Bu repo (`eonarya-website`) ile `Eonarya` (uygulama) reposunun **kardeş klasörler**
olarak checkout edilmiş olması beklenir:

```
C:\Arif\Eonarya\Eonarya            (uygulama reposu)
C:\Arif\Eonarya\eonarya-website    (bu repo)
```

Farklı bir yerdeyse yardım senkronu için `EONARYA_APP_REPO`, deneyim senkronu
için `EONARYA_APP_ROOT` ortam değişkenini o checkout'un tam yoluna ayarlayın:

```bash
EONARYA_APP_REPO=/path/to/Eonarya node scripts/sync-help-content.js
EONARYA_APP_ROOT=/path/to/Eonarya node scripts/sync-experience.js
```

Script'ler `@babel/parser` ve `@babel/traverse` kullanır (kaynak dosyayı hiç
`require`/`import` **etmeden**, yalnızca AST üzerinden okur — bu yüzden uygulamanın
React Native/Deno bağımlılıkları hiç gerekmez). Bu paketler `eonarya-website` için
`npm install` ile kurulabilir; kurulmadıysa script otomatik olarak kardeş Eonarya
reposunun kendi `node_modules`'ına düşer (zaten oradalar).

## Marka / deneyim — `npm run sync:experience`

Bu akış TypeScript AST okumaz. İki açık canonical veri kaynağını tüketir:

- `Eonarya/supabase/functions/_shared/experience/design-tokens.json`
- `Eonarya/supabase/functions/_shared/experience/content.json`

Üretilen `assets/experience-tokens.css`, `generated/experience-content.js` ve
`generated/experience-manifest.json` website çalışma zamanını uygulama reposunun
implementation detaylarına bağlamaz. Web ve e-posta logo dosyaları da uygulamadaki
canonical master PNG'lerden aynı komutla deterministik olarak türetilir; public
asset yolları değişmez.

`npm run check:experience` committed çıktıların kaynaklarla aynı olduğunu,
`npm run test:experience` ise private shell, footer varyantları, token temizliği,
no-store ve logo/link sözleşmelerini doğrular.

## Yardım Merkezi — `npm run sync:help`

```bash
node scripts/sync-help-content.js
```

`npm run check:help`, committed `generated/help-content.json` ve `yardim.html`
veri bloğunun canonical uygulama kaynağıyla aynı olduğunu dosya yazmadan doğrular.

**Kaynak:** `Eonarya/shared/content/helpContent.data.js` (kategori/soru/cevap) +
canonical “nedir?” yanıtları için `Eonarya/supabase/functions/_shared/experience/content.json`
+ `Eonarya/shared/uiSabitleri.js` → `TELEFON_DOGRULAMA_AKTIF` flag'i. Script,
modülleri çalıştırmadan bu kaynakları AST/JSON üzerinden çözümler.

**Çıktı:**
- `generated/help-content.json` — üretilen veri, insan tarafından okunabilir kontrol için.
- `yardim.html` içindeki `<!-- GENERATED:HELP-CONTENT:START -->` … `END` bloğu —
  sayfa bu bloktaki JSON'ı çalışma zamanında okuyup kategori/accordion/arama
  arayüzünü JS ile oluşturur.

**Davranış paritesi (K41 — uygulamayla aynı kural):**
- `answer: null` olan sorular gizlenmez; `"Bu sorunun cevabı henüz hazırlanıyor."`
  metniyle gösterilir (bkz. `docs/S-YARDIM-MERKEZI.md` → Bölüm 6).
- `flag: 'TELEFON_DOGRULAMA_AKTIF'` taşıyan sorular, o flag `false` olduğu sürece
  çıktıya hiç dahil edilmez.

## Ne zaman çalıştırılmalı

`Eonarya/shared/content/helpContent.data.js` her değiştiğinde (yeni soru, silinen
soru, metin düzeltmesi) bu script yeniden çalıştırılıp `yardim.html` + `generated/`
commit'lenmelidir. Aksi halde web sitesindeki Yardım Merkezi uygulamadan geride kalır.

## Hukuki metinler — `npm run sync:legal`

Tek düzenleme kaynağı `Eonarya/services/contracts.js` dosyasıdır; hangi sayfanın
hangi belgeden üretileceği ve her belgenin onaylı sürümleri
`Eonarya/shared/content/hukukiSurumDefteri.json` defterindedir. Üretimden önce
uygulama reposundaki ortak doğrulayıcı (`Eonarya/scripts/hukuki-surum-dogrulama.cjs`)
metnin SHA-256 değerini defterdeki güncel onaylı kayıtla karşılaştırır: sürüm sabiti
olmayan eski dal, onaysız/taslak sürüm, eski onaylı sürüm veya aynı sürüm numarasıyla
değişmiş metin web'e yazılamaz. `generated/legal-parity-manifest.json` her sayfanın
yayımlı sürümünü, onaylı metin hash'ini ve görünür web metni hash'ini kilitler; web'in
yayımladığı sürümden geriye düşülemez. Hata durumunda hiçbir dosya yazılmaz.
Üçüncü kişi aydınlatma sayfasında veri sorumlusu unvanı/adresi eksikken taslak uyarısı
otomatik korunur. `kvkk.html` web'e özel bilgilendirme sayfasıdır: NFC bölümü
`GENERATED:KVKK-NFC` işaretleri arasında aynı senkronla üretilir ve yalnız Aydınlatma
Metni ile Gizlilik Politikası'na doğrulanmış güncel sürüm numaralarıyla yönlendirir;
blok elle düzenlenmez ve blok dışında bağımsız NFC açıklaması bulunursa üretim durur. `npm run check:legal` drift'te, `npm run test:legal` negatif
senaryolarda fail verir; `npm run test:experience` ikisini de çalıştırır. Uygulama
reposunda yayımlanmamış taslaklar (`services/hukukiMetinTaslaklari.js`) web üretimine
hiç girmez.

## Rehber — `npm run build:blog`

`scripts/build-blog.js`, Supabase REST API'sinden yalnız `live_snapshot` bulunan
`blog_posts` satırlarını alır ve `/blog/`, `/blog/<slug>/` ile `sitemap.xml`
çıktılarını statik HTML olarak üretir. Sorgu editoryal taslak kolonlarını istemez;
sayfa gövdesi çalışma zamanında JavaScript'e ihtiyaç duymaz.

Komut yalnız sunucu/CI ortamında çalıştırılır:

```bash
SUPABASE_URL=https://PROJECT.supabase.co SUPABASE_SECRET_KEY=sb_secret_... npm run build:blog
```

Yeni secret key bulunmayan eski projelerde `SUPABASE_SERVICE_ROLE_KEY` geçici
uyumluluk fallback'idir. Bu anahtarların hiçbiri public HTML'e veya tarayıcı
JavaScript'ine yazılmaz. `npm run check:blog` aynı veri ve dış gövde görseli
kontrollerini dosya yazmadan yapar; `npm run test:blog` fixture verisiyle taslak
sızıntısı, SEO, sitemap, tek H1 ve kırık/alt metinsiz görsel senaryolarını sınar.

### Yayın ve yayından kaldırma

`.github/workflows/blog-pages.yml` yalnız `admin-blog-islem` tarafından
`workflow_dispatch` ile başlatılır. Workflow, kilitlenen içeriğin `updated_at`
değerini karşılaştırır; mevcut `live_snapshot` kümesinden önceki public artifact'ı,
kilitli taslaktan da aday artifact'ı üretir. Aday GitHub Pages'e çıktıktan sonra
canlı `/blog/` HTML'leri ve sitemap yerel dosyalarla birebir karşılaştırılır.

Doğrulama ve Supabase sonlandırması başarılı olmadan `live_snapshot` değişmez.
Aday deploy edildikten sonraki bir adım başarısız olursa önceki artifact yeniden
deploy edilir; veritabanı durumu `error` olur ve eski snapshot korunur. Ayrı release
manifest, job/deployment tablosu veya ikinci publish endpoint'i yoktur.

Workflow secret'ları:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (legacy fallback: `SUPABASE_SERVICE_ROLE_KEY`)

Admin Edge Function secret'ı `BLOG_GITHUB_TOKEN` yalnız website reposunda Actions
write yetkisine sahip dar kapsamlı bir token olmalıdır. Opsiyonel
`BLOG_GITHUB_OWNER`, `BLOG_GITHUB_REPO`, `BLOG_GITHUB_WORKFLOW` ve
`BLOG_GITHUB_REF` değerlerinin varsayılanları sırasıyla `arifay1980`,
`eonarya-website`, `blog-pages.yml` ve `main`'dir. Admin arayüzüne bu teknik
ayrıntıların hiçbiri gönderilmez.
