# Eonarya — Kurumsal ve alıcı web sitesi

Statik HTML/CSS/JavaScript sitesi; Node script'leri içerik üretir ve doğrular. Çalışma/yetki girişi [CLAUDE.md](CLAUDE.md), içerik kaynakları ve üretim yöntemi [scripts/README.md](scripts/README.md) içindedir. Bu belge başlangıç yönlendirmesidir; package.json/workflow değiştiğinde güncellenir, test sonucu tutmaz.

Gerçek komutlar [package.json](package.json) içindedir. `check:experience`, `check:help`, `check:legal` üretilmiş çıktıların kaynakla uyumunu denetler; `test:experience` deneyim/hukuk/consent kontrollerini, `test:blog` Rehber testlerini yürütür. `sync:all`, tekil `sync:*` ve `build:blog` çıktı yazar; salt-okuma incelemesinde çalıştırılmaz. Yalnız etkilenen kontroller [Z0](../Eonarya/docs/testler/Z0-TEST-PROTOKOLU.md) uyarınca seçilir. Üretilen dosyayı elle düzeltmek yerine canonical kaynak kullanılır; başka oturumun çıktısı ezilmez.

**Yayın:** [.github/workflows/blog-pages.yml](.github/workflows/blog-pages.yml) `main` push'unda siteyi üretip GitHub Pages'e yayınlar; manuel dispatch ayrı içerik yayın akışıdır. Push/dispatch bu nedenle production yetkisi ve ilgili kabul gerektirir. Gerçek yayın sonucu yalnız workflow/canlı kanıtla doğrulanır. Genel altyapı sahibi [S-ALTYAPI](../Eonarya/docs/sistemler/S-ALTYAPI.md) §4'tür. Yeni çalışma dalı/klasörü kendiliğinden oluşturulmaz.
