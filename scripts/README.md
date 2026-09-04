# Senkronizasyon script'leri

Bu klasördeki script'ler, `eonarya.com`'un elle iki kez düzenlenmesini gerektiren
içeriklerini (Yardım Merkezi, ileride hukuki metinler) kardeş **Eonarya** uygulama
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

Farklı bir yerdeyse `EONARYA_APP_REPO` ortam değişkenini o checkout'un tam yoluna
ayarlayın:

```bash
EONARYA_APP_REPO=/path/to/Eonarya node scripts/sync-help-content.js
```

Script'ler `@babel/parser` ve `@babel/traverse` kullanır (kaynak dosyayı hiç
`require`/`import` **etmeden**, yalnızca AST üzerinden okur — bu yüzden uygulamanın
React Native/Deno bağımlılıkları hiç gerekmez). Bu paketler `eonarya-website` için
`npm install` ile kurulabilir; kurulmadıysa script otomatik olarak kardeş Eonarya
reposunun kendi `node_modules`'ına düşer (zaten oradalar).

## Yardım Merkezi — `npm run sync:help`

```bash
node scripts/sync-help-content.js
```

**Kaynak:** `Eonarya/shared/content/helpContent.data.js` (bağımlılıksız veri —
kategori/soru/cevap) + `Eonarya/shared/uiSabitleri.js` → `TELEFON_DOGRULAMA_AKTIF`
flag'i.

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

## Hukuki metinler (henüz yok)

Aynı model (canonical source + generated block) hukuki metinler
(`gizlilik.html`, `kullanim-sartlari.html`, `aydinlatma.html`, `kvkk.html`) için de
planlanıyor — kaynak `Eonarya/services/contracts.js`. Bu script henüz yazılmadı;
ayrı bir işte ele alınacak (bkz. proje Y- kayıtları).
