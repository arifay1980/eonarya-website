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

Kaynak `Eonarya/services/contracts.js` dosyasıdır. Üçüncü kişi aydınlatma sayfasının
gövdesi canonical metinden deterministik üretilir; veri sorumlusu unvanı/adresi
eksikken taslak uyarısı otomatik korunur. Kullanıcı Sözleşmesi, Gizlilik Politikası
ve kullanıcı Aydınlatma Metni için her canonical satırın web çıktısında bulunduğu
doğrulanır. `generated/legal-parity-manifest.json` source ve görünür web metni
hash'lerini kilitler; `npm run check:legal` eksik içerik veya sessiz drift'te fail
verir. `npm run test:experience` bu kontrolü de çalıştırır.
