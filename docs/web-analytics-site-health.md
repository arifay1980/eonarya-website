# Eonarya Web Analitik ve Site Sağlığı

Bu dosya web analitik/site sağlığı işinin kalıcı çalışma kaydıdır. Fazlar sırayla ilerler; araç kurulumu tek başına tamamlanma sayılmaz.

## Faz 1 — Google Analytics 4
**Kod: tamamlandı · Canlı veri doğrulaması: bekliyor**

- Ölçüm kimliği: `G-GFHVXH40X5`.
- Analitik yalnız kamuya açık sayfalarda yüklenir.
- `bilgi.html`, `mesaj.html`, `onay.html`, `onay-hatirlatma.html`, `tercihler.html` ve `ucuncu-kisi-aydinlatma.html` üzerinde analitik kapalıdır.
- Google Analytics, kullanıcı açıkça izin vermeden yüklenmez ve Google'a analitik isteği gönderilmez.
- Reklam sinyalleri ve reklam kişiselleştirme sinyalleri kapalıdır.
- Sayfa URL'lerindeki query/hash GA4'e page_location olarak gönderilmez. Yalnız bilinen UTM alanları kampanya bilgisi olarak kullanılabilir.
- İlk olaylar: `cta_click`, `help_search_used`, `support_form_success`.
- Yardım arama metni; destek formundaki ad, e-posta, konu ve mesaj GA4'e gönderilmez.
- Kullanıcı tercihini footer'daki **Analitik tercihleri** üzerinden değiştirebilir.

**Tamamlanma ölçütü:** canlı sitede izin sonrası GA4 Realtime/DebugView üzerinde `page_view` ve en az bir izinli olay görülmeli.

## Faz 2 — Google görünürlüğü
**Teknik temel: tamamlandı · Search Console property doğrulaması: bekliyor**

- `robots.txt` ve `sitemap.xml` mevcut.
- İndekslenebilir sayfalarda canonical standardı uygulanır.
- Özel teslimat/onay sayfaları `noindex` + robots disallow ile ayrılır.
- Hatalı iç bağlantı ve anchor'lar kaynak sağlık kontrolünü fail eder.

**Dış adım:** Search Console domain property doğrulanacak, sitemap gönderilecek ve veri akışı görüldükten sonra performans sorguları izlenecek.

## Faz 3 — Microsoft Clarity
**Başlatılmadı**

GA4 canlı verisi doğrulanmadan Clarity eklenmeyecek. Eklenirse aynı analitik iznine bağlanacak; özel teslimat/onay sayfalarında çalışmayacak. Dashboard tarafında text/input masking ayrıca doğrulanacak.

## Faz 4 — Teknik SEO / site sağlığı
**İlk katman: aktif**

- `scripts/check-web-health.js`: title/meta/canonical, sitemap/robots, noindex sınırları, özel sayfalarda tracking yasağı, kırık iç link/anchor ve 404 kontrollerini yapar.
- GitHub Actions `Site Health` akışı push'ta kaynak kontrolü, günlük ve elle çalıştırmada canlı site kontrolü yapar.
- Ahrefs Webmaster Tools ancak bu katmanın kapsamadığı gerçek bir ihtiyaç görülürse eklenecek.

## Faz 5 — Performans
**Bekliyor**

Core Web Vitals (LCP/INP/CLS) ve mobil performans için önce gerçek saha verisi/uygun veri kaynağı seçilecek. Tek seferlik Lighthouse puanı kalıcı sağlık ölçümü sayılmayacak.

## Faz 6 — Otomatik uyarılar
**Bekliyor**

GA4/Search Console ve site sağlık kontrolleri yeterli veri ürettikten sonra eşikler belirlenecek. Gürültülü alarm üretilmeyecek.

## Faz 7 — Yönetici raporu
**Bekliyor**

Veri kaynakları doğrulandıktan sonra haftalık/aylık kısa durum raporu tasarlanacak.

## Faz 8 — Admin Panel Web / Site Sağlığı
**Bekliyor**

Sağlayıcı panellerinin kopyası yapılmayacak. Yalnız müdahale gerektiren trafik, görünürlük, teknik sağlık ve performans özeti taşınacak.

## Faz 9 — İleri ürün analitiği
**Bekliyor / ihtiyaç oluşmadı**

PostHog, funnel/cohort ve ileri event tracking ancak web ürünü gerçekten karmaşıklaştığında değerlendirilecek.

## Kapanış kuralı

Her faz ancak şu dört koşul birlikte sağlanınca kapanır:

1. kod/ayar uygulanmış,
2. üretimde çalıştığı doğrulanmış,
3. mahremiyet sınırları doğrulanmış,
4. Eonarya için anlamlı veri ürettiği görülmüş.
