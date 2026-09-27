const fs = require("node:fs/promises");
const path = require("node:path");

const SITE_ORIGIN = "https://eonarya.com";
const DEFAULT_SOCIAL_IMAGE = `${SITE_ORIGIN}/assets/social/eonarya-og.jpg`;
const BLOG_MEDIA_BUCKET = "blog-media";
const ALLOWED_CONTENT_TAGS = new Set([
  "p", "br", "h2", "h3", "strong", "em", "ul", "ol", "li", "a", "img",
]);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonLd(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function xml(value = "") {
  return escapeHtml(value);
}

function isoDate(value, field) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.valueOf())) {
    throw new Error(`${field} geçerli bir tarih olmalı.`);
  }
  return parsed.toISOString();
}

function displayDate(value) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(new Date(value));
}

function storagePublicUrl(storagePath, supabaseUrl) {
  if (/^https:\/\//i.test(storagePath)) return storagePath;
  if (!supabaseUrl) {
    throw new Error("Kapak görseli yolu için SUPABASE_URL gerekli.");
  }
  const encodedPath = String(storagePath).split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BLOG_MEDIA_BUCKET}/${encodedPath}`;
}

function attributes(tag) {
  const result = {};
  const source = tag.replace(/^<\/?[a-z0-9:-]+/i, "").replace(/\/?\s*>$/, "");
  const matcher = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(matcher)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  }
  return result;
}

function validateContentHtml(contentHtml) {
  if (typeof contentHtml !== "string" || !contentHtml.trim()) {
    throw new Error("Yayındaki içerik gövdesi boş olamaz.");
  }

  for (const match of contentHtml.matchAll(/<\/?\s*([a-z0-9:-]+)\b[^>]*>/gi)) {
    const tag = match[1].toLowerCase();
    if (!ALLOWED_CONTENT_TAGS.has(tag)) {
      throw new Error(`İçerik gövdesinde izin verilmeyen etiket: ${tag}`);
    }
    if (/\s(?:on[a-z]+|style|srcdoc)\s*=/i.test(match[0])) {
      throw new Error("İçerik gövdesinde güvenli olmayan HTML niteliği var.");
    }
  }

  for (const match of contentHtml.matchAll(/<a\b[^>]*>/gi)) {
    const href = attributes(match[0]).href;
    if (!href || !/^(https?:\/\/|mailto:|\/|#)/i.test(href)) {
      throw new Error("İçerik bağlantısı güvenli bir HTTP(S), mailto veya site içi adres olmalı.");
    }
  }

  const images = [];
  for (const match of contentHtml.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (!attrs.alt || !attrs.alt.trim()) {
      throw new Error("İçerik gövdesindeki her görselin alt metni olmalı.");
    }
    if (!attrs.src || !/^(https?:\/\/|\/)/i.test(attrs.src)) {
      throw new Error("İçerik görseli güvenli bir HTTP(S) veya site içi adres kullanmalı.");
    }
    if (/^https?:\/\//i.test(attrs.src)) images.push(attrs.src);
  }
  return [...new Set(images)];
}

async function checkRemoteImages(urls, fetchImpl = globalThis.fetch) {
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      let response = await fetchImpl(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
      });
      let contentType = response.headers?.get?.("content-type") || "";
      if (!response.ok || !contentType.toLowerCase().startsWith("image/")) {
        response = await fetchImpl(url, {
          method: "GET",
          redirect: "follow",
          headers: { Range: "bytes=0-0", Accept: "image/*" },
          signal: controller.signal,
        });
        contentType = response.headers?.get?.("content-type") || "";
      }
      if (!response.ok || !contentType.toLowerCase().startsWith("image/")) {
        throw new Error(`HTTP ${response.status}; content-type=${contentType || "yok"}`);
      }
    } catch (error) {
      throw new Error(`İçerik görseline erişilemiyor: ${url} (${error.message})`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function preparePosts(rows, { supabaseUrl } = {}) {
  if (!Array.isArray(rows)) throw new Error("Blog verisi dizi olmalı.");
  const posts = rows.filter((row) => row?.live_snapshot && !row.deleted_at).map((row) => {
    const live = row.live_snapshot;
    const required = ["title", "slug", "summary", "content_html", "cover_image_path", "cover_image_alt", "seo_description"];
    for (const field of required) {
      if (typeof live[field] !== "string" || !live[field].trim()) {
        throw new Error(`${live.slug || "Bilinmeyen içerik"}: live_snapshot.${field} zorunlu.`);
      }
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(live.slug)) {
      throw new Error(`${live.slug}: geçersiz yayın slug'ı.`);
    }
    const publishedAt = isoDate(live.published_at || row.published_at, "published_at");
    const modifiedAt = isoDate(live.updated_at || live.published_at || row.published_at, "live_snapshot.updated_at");
    const relatedIds = Array.isArray(live.related_post_ids) ? [...new Set(live.related_post_ids)].slice(0, 3) : [];
    return {
      id: live.id || row.id || null,
      title: live.title.trim(),
      slug: live.slug,
      summary: live.summary.trim(),
      contentHtml: live.content_html.trim(),
      coverImageUrl: storagePublicUrl(live.cover_image_path, supabaseUrl),
      coverImageAlt: live.cover_image_alt.trim(),
      seoTitle: typeof live.seo_title === "string" && live.seo_title.trim()
        ? live.seo_title.trim()
        : `${live.title.trim()} | Eonarya Rehber`,
      seoDescription: live.seo_description.trim(),
      relatedIds,
      publishedAt,
      modifiedAt,
    };
  });

  const slugs = new Set();
  for (const post of posts) {
    if (slugs.has(post.slug)) throw new Error(`Tekrarlanan yayın slug'ı: ${post.slug}`);
    slugs.add(post.slug);
  }
  return posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function renderHead({ title, description, canonical, image = DEFAULT_SOCIAL_IMAGE, imageAlt = "Eonarya", type = "website", jsonLdValue = null }) {
  return `
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta name="theme-color" content="#121218">
  <meta property="og:type" content="${escapeHtml(type)}">
  <meta property="og:locale" content="tr_TR">
  <meta property="og:site_name" content="Eonarya">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:alt" content="${escapeHtml(imageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}">
  <script src="/assets/consent.js" defer></script>
  <link rel="icon" type="image/png" href="/assets/brand/symbol-dark.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/experience-tokens.css">
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="stylesheet" href="/assets/footer-family.css">
  <link rel="stylesheet" href="/assets/consent.css">
  <link rel="stylesheet" href="/assets/blog.css">${jsonLdValue ? `
  <script type="application/ld+json">${jsonLd(jsonLdValue)}</script>` : ""}`;
}

function renderHeader() {
  return `<a class="skip" href="#icerik">İçeriğe geç</a>
  <header class="nav"><div class="wrap nav-inner">
    <a class="brand" href="/" aria-label="Eonarya ana sayfa"><img src="/assets/brand/logo-light.png" width="720" height="86" alt="Eonarya"></a>
    <button class="menu-toggle" type="button" aria-label="Menüyü aç" aria-controls="main-nav" aria-expanded="false"><span></span></button>
    <nav class="nav-links" id="main-nav" aria-label="Ana bölümler"><a href="/#nasil">Nasıl çalışır?</a><a href="/#urun">Ürün</a><a href="/#guven">Güven</a><a href="/yardim.html">Yardım</a><a href="/blog/" aria-current="page">Rehber</a></nav>
  </div></header>`;
}

function renderFooter() {
  return `<footer class="footer blog-footer"><div class="wrap"><div class="footer-grid"><img class="footer-logo" src="/assets/brand/logo-light.png" width="720" height="86" alt="Eonarya"><nav class="footer-links" aria-label="Alt bağlantılar"><a href="/blog/">Rehber</a><a href="/yardim.html">Yardım Merkezi</a><a href="/gizlilik.html">Gizlilik</a><a href="/kullanim-sartlari.html">Kullanım Şartları</a><a href="/aydinlatma.html">Aydınlatma Metni</a><a href="/yardim.html#destek">Bize Mesaj Gönder</a><button type="button" data-cookie-settings>Çerez Ayarları</button></nav></div><p class="copyright">© 2026 Eonarya. Tüm hakları saklıdır.</p></div></footer>`;
}

function renderCard(post) {
  return `<article class="blog-card">
          <a class="blog-card-media" href="/blog/${escapeHtml(post.slug)}/" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(post.coverImageUrl)}" alt="" width="1200" height="675" loading="lazy"></a>
          <div class="blog-card-body"><time datetime="${escapeHtml(post.publishedAt)}">${escapeHtml(displayDate(post.publishedAt))}</time><h2><a href="/blog/${escapeHtml(post.slug)}/">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.summary)}</p></div>
        </article>`;
}

function renderList(posts) {
  const canonical = `${SITE_ORIGIN}/blog/`;
  const cards = posts.length ? posts.map(renderCard).join("\n        ") : `<p class="blog-empty">Yayındaki rehberler yakında burada yer alacak.</p>`;
  return `<!doctype html>
<html lang="tr">
<head>${renderHead({
    title: "Rehber | Eonarya",
    description: "Dijital süreklilik, geleceğe bırakılan mesajlar ve Eonarya kullanımına ilişkin sade rehberler.",
    canonical,
    imageAlt: "Eonarya Rehber",
  })}
</head>
<body data-footer-variant="public">
  ${renderHeader()}
  <main id="icerik" class="blog-main">
    <section class="blog-hero"><div class="wrap blog-narrow"><p class="eyebrow">EONARYA REHBER</p><h1>Önemli olanı geleceğe taşımak için sade rehberler.</h1><p>Dijital süreklilik, planlar ve zamanı geldiğinde ulaşmasını istediğin içerikler hakkında anlaşılır bilgiler.</p></div></section>
    <section class="wrap blog-list" aria-label="Rehber içerikleri">
      ${cards}
    </section>
  </main>
  ${renderFooter()}
  <script src="/assets/site.js" defer></script>
</body>
</html>\n`;
}

function renderDetail(post, postById) {
  const canonical = `${SITE_ORIGIN}/blog/${post.slug}/`;
  const related = post.relatedIds.map((id) => postById.get(id)).filter(Boolean).slice(0, 3);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription,
    image: [post.coverImageUrl],
    datePublished: post.publishedAt,
    dateModified: post.modifiedAt,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    publisher: {
      "@type": "Organization",
      name: "Eonarya",
      url: `${SITE_ORIGIN}/`,
      logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/assets/brand/symbol-dark.png` },
    },
  };
  const relatedSection = related.length ? `
      <section class="related-guides" aria-labelledby="ilgili-rehberler"><h2 id="ilgili-rehberler">İlgili rehberler</h2><div class="related-grid">${related.map((item) => `<article><time datetime="${escapeHtml(item.publishedAt)}">${escapeHtml(displayDate(item.publishedAt))}</time><h3><a href="/blog/${escapeHtml(item.slug)}/">${escapeHtml(item.title)}</a></h3></article>`).join("")}</div></section>` : "";
  return `<!doctype html>
<html lang="tr">
<head>${renderHead({
    title: post.seoTitle,
    description: post.seoDescription,
    canonical,
    image: post.coverImageUrl,
    imageAlt: post.coverImageAlt,
    type: "article",
    jsonLdValue: structuredData,
  })}
  <meta property="article:published_time" content="${escapeHtml(post.publishedAt)}">
  <meta property="article:modified_time" content="${escapeHtml(post.modifiedAt)}">
</head>
<body data-footer-variant="public">
  ${renderHeader()}
  <main id="icerik" class="blog-main">
    <article class="blog-article">
      <header class="blog-article-header wrap blog-narrow"><a class="blog-back" href="/blog/">Rehber</a><h1>${escapeHtml(post.title)}</h1><p class="blog-summary">${escapeHtml(post.summary)}</p><p class="blog-dates"><span>Yayın: <time datetime="${escapeHtml(post.publishedAt)}">${escapeHtml(displayDate(post.publishedAt))}</time></span><span>Güncelleme: <time datetime="${escapeHtml(post.modifiedAt)}">${escapeHtml(displayDate(post.modifiedAt))}</time></span></p></header>
      <figure class="blog-cover wrap"><img src="${escapeHtml(post.coverImageUrl)}" alt="${escapeHtml(post.coverImageAlt)}" width="1200" height="675" fetchpriority="high"></figure>
      <div class="blog-content wrap blog-reading">${post.contentHtml}</div>
      <aside class="blog-cta wrap blog-reading" aria-label="Eonarya hakkında"><p>Önem verdiğin içerikleri bugünden hazırlayıp zamanı geldiğinde ulaşacak şekilde planlayabilirsin.</p><a href="/#nasil">Eonarya nasıl çalışır?</a></aside>${relatedSection}
    </article>
  </main>
  ${renderFooter()}
  <script src="/assets/site.js" defer></script>
</body>
</html>\n`;
}

function renderSitemap(posts) {
  const fixed = [
    ["/", "weekly", "1.0"],
    ["/blog/", "weekly", "0.9"],
    ["/yardim.html", "weekly", "0.9"],
    ["/gizlilik.html", "monthly", "0.3"],
    ["/kullanim-sartlari.html", "monthly", "0.3"],
    ["/kvkk.html", "monthly", "0.3"],
    ["/aydinlatma.html", "monthly", "0.3"],
    ["/cerez-politikasi.html", "monthly", "0.3"],
  ];
  const urls = fixed.map(([pathname, changefreq, priority]) => `  <url>\n    <loc>${xml(`${SITE_ORIGIN}${pathname}`)}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`);
  for (const post of posts) {
    urls.push(`  <url>\n    <loc>${xml(`${SITE_ORIGIN}/blog/${post.slug}/`)}</loc>\n    <lastmod>${xml(post.modifiedAt.slice(0, 10))}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

async function buildBlog({ rows, outputDir, supabaseUrl, fetchImpl = globalThis.fetch, write = true }) {
  const posts = preparePosts(rows, { supabaseUrl });
  const imageUrls = [];
  for (const post of posts) imageUrls.push(...validateContentHtml(post.contentHtml));
  await checkRemoteImages([...new Set(imageUrls)], fetchImpl);

  const byId = new Map(posts.filter((post) => post.id).map((post) => [post.id, post]));
  const files = new Map([["blog/index.html", renderList(posts)], ["sitemap.xml", renderSitemap(posts)]]);
  for (const post of posts) files.set(`blog/${post.slug}/index.html`, renderDetail(post, byId));

  if (write) {
    await fs.rm(path.join(outputDir, "blog"), { recursive: true, force: true });
    for (const [relativePath, content] of files) {
      const target = path.join(outputDir, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf8");
    }
  }
  return { posts, files, checkedImageCount: new Set(imageUrls).size };
}

module.exports = {
  buildBlog,
  checkRemoteImages,
  preparePosts,
  renderDetail,
  renderList,
  renderSitemap,
  validateContentHtml,
};
