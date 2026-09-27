const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  buildBlog,
  preparePosts,
  renderList,
  validateContentHtml,
} = require("../scripts/blog-generator");

const LIVE_IMAGE = "https://cdn.example.test/cover.jpg";

function liveSnapshot(overrides = {}) {
  return {
    title: "Dijital Miras Nedir?",
    slug: "dijital-miras-nedir",
    summary: "Dijital mirası sade bir dille açıklayan rehber.",
    content_html: '<p>Canlı içerik.</p><h2>Temel kavramlar</h2><p><strong>Sade</strong> açıklama.</p><img src="https://images.example.test/body.jpg" alt="Bir mektup ve saat">',
    cover_image_path: LIVE_IMAGE,
    cover_image_alt: "Bir mektup ve saat",
    seo_title: "Dijital Miras Nedir? | Eonarya Rehber",
    seo_description: "Dijital mirasın ne olduğunu ve nasıl planlanabileceğini öğrenin.",
    related_post_ids: [],
    updated_at: "2026-09-25T12:00:00.000Z",
    ...overrides,
  };
}

function row(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    published_at: "2026-09-20T09:00:00.000Z",
    deleted_at: null,
    live_snapshot: liveSnapshot(),
    title: "TASLAK-GIZLI-BASLIK",
    content_html: "TASLAK-GIZLI-GOVDE",
    ...overrides,
  };
}

function imageResponse(status = 200, contentType = "image/jpeg") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
  };
}

async function outputDir(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "eonarya-blog-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("yalnız live_snapshot içeriğini statik liste ve detay sayfasına yazar", async (t) => {
  const directory = await outputDir(t);
  const result = await buildBlog({
    rows: [row(), row({ id: "draft-only", live_snapshot: null, title: "SADECE-TASLAK" })],
    outputDir: directory,
    supabaseUrl: "https://project.supabase.co",
    fetchImpl: async () => imageResponse(),
  });

  assert.equal(result.posts.length, 1);
  const list = await fs.readFile(path.join(directory, "blog/index.html"), "utf8");
  const detail = await fs.readFile(path.join(directory, "blog/dijital-miras-nedir/index.html"), "utf8");
  assert.match(list, /Dijital Miras Nedir\?/);
  assert.match(detail, /Canlı içerik\./);
  assert.doesNotMatch(`${list}${detail}`, /TASLAK-GIZLI|SADECE-TASLAK/);
});

test("detay SEO, tarih, tek H1, semantik gövde ve en fazla üç canlı ilgili rehber üretir", async (t) => {
  const directory = await outputDir(t);
  const related = [2, 3, 4, 5].map((number) => row({
    id: `00000000-0000-4000-8000-00000000000${number}`,
    live_snapshot: liveSnapshot({
      title: `İlgili ${number}`,
      slug: `ilgili-${number}`,
      related_post_ids: [],
    }),
  }));
  const primary = row({ live_snapshot: liveSnapshot({ related_post_ids: related.map((item) => item.id) }) });
  await buildBlog({ rows: [primary, ...related], outputDir: directory, fetchImpl: async () => imageResponse() });
  const html = await fs.readFile(path.join(directory, "blog/dijital-miras-nedir/index.html"), "utf8");

  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<h2>Temel kavramlar<\/h2>/);
  assert.match(html, /rel="canonical" href="https:\/\/eonarya.com\/blog\/dijital-miras-nedir\/"/);
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /"@type":"BlogPosting"/);
  assert.match(html, /"datePublished":"2026-09-20T09:00:00.000Z"/);
  assert.match(html, /"dateModified":"2026-09-25T12:00:00.000Z"/);
  assert.equal((html.match(/<article><time/g) || []).length, 3);
  assert.doesNotMatch(html, /İlgili 5/);
});

test("liste kartlarında tarih gösterir ve sitemap yalnız canlı detay URL'lerini içerir", async (t) => {
  const directory = await outputDir(t);
  await buildBlog({
    rows: [row(), row({ id: "draft-only", live_snapshot: null })],
    outputDir: directory,
    fetchImpl: async () => imageResponse(),
  });
  const list = await fs.readFile(path.join(directory, "blog/index.html"), "utf8");
  const sitemap = await fs.readFile(path.join(directory, "sitemap.xml"), "utf8");
  assert.match(list, /<time datetime="2026-09-20T09:00:00.000Z">/);
  assert.match(sitemap, /https:\/\/eonarya.com\/blog\//);
  assert.match(sitemap, /https:\/\/eonarya.com\/blog\/dijital-miras-nedir\//);
  assert.match(sitemap, /https:\/\/eonarya.com\/cerez-politikasi\.html/);
  assert.doesNotMatch(sitemap, /draft-only|SADECE-TASLAK/);
  assert.doesNotMatch(sitemap, /bilgi\.html|mesaj\.html|onay(?:-hatirlatma)?\.html|tercihler\.html/);
});

test("dış gövde görseli kırık veya görsel olmayan yanıt verirse üretimi durdurur", async (t) => {
  const directory = await outputDir(t);
  await assert.rejects(
    buildBlog({ rows: [row()], outputDir: directory, fetchImpl: async () => imageResponse(404, "text/html") }),
    /İçerik görseline erişilemiyor/,
  );
});

test("gövde görselinde alt metin yoksa ve H1 gibi izin dışı etiket varsa reddeder", () => {
  assert.throws(() => validateContentHtml('<p>Metin</p><img src="https://example.test/a.jpg" alt="">'), /alt metni/);
  assert.throws(() => validateContentHtml("<h1>İkinci ana başlık</h1>"), /izin verilmeyen etiket: h1/);
  assert.throws(() => validateContentHtml('<p style="color:red">Metin</p>'), /güvenli olmayan HTML niteliği/);
});

test("silinmiş kayıt ve live_snapshot bulunmayan taslak veri modelde hiç hazırlanmaz", () => {
  const posts = preparePosts([
    row(),
    row({ id: "draft", live_snapshot: null }),
    row({ id: "deleted", deleted_at: "2026-09-24T10:00:00Z" }),
  ]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, "Dijital Miras Nedir?");
});

test("REST kaynak sorgusu editoryal taslak kolonlarını istemez", async () => {
  const source = await fs.readFile(path.join(__dirname, "../scripts/build-blog.js"), "utf8");
  assert.match(source, /select: "id,live_snapshot,published_at,deleted_at"/);
  assert.doesNotMatch(source, /select: "[^"]*(?:title|summary|content_html|seo_title)/);
  assert.match(source, /live_snapshot: "not\.is\.null"/);
  assert.match(source, /deleted_at: "is\.null"/);
});

test("commitli boş liste sayfası üretici şablonuyla birebir eşleşir", async () => {
  const committed = await fs.readFile(path.join(__dirname, "../blog/index.html"), "utf8");
  assert.equal(committed.replaceAll("\r\n", "\n"), renderList([]));
});
