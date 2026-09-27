const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  finalPayload,
  finalizePublication,
  makePublicationPlan,
} = require("../scripts/blog-publication");
const { buildBlog } = require("../scripts/blog-generator");
const { verifyOnce } = require("../scripts/verify-blog-deployment");

const LOCK = "2026-09-26T10:00:00.000Z";
const NOW = "2026-09-26T10:05:00.000Z";

function editorial(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Yeni başlık",
    slug: "ornek-rehber",
    summary: "Yeni özet",
    content_html: "<p>Yeni ve canlı olacak gövde.</p><h2>Başlık</h2>",
    cover_image_path: "https://images.example.test/cover.jpg",
    cover_image_alt: "Örnek kapak",
    seo_title: null,
    seo_description: "Yeni meta açıklaması",
    related_post_ids: [],
    status: "publishing",
    live_snapshot: null,
    published_at: null,
    updated_at: LOCK,
    deleted_at: null,
    ...overrides,
  };
}

function liveRow(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    published_at: "2026-09-20T09:00:00.000Z",
    deleted_at: null,
    live_snapshot: {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Eski başlık",
      slug: "ornek-rehber",
      summary: "Eski özet",
      content_html: "<p>Eski canlı gövde.</p>",
      cover_image_path: "https://images.example.test/old.jpg",
      cover_image_alt: "Eski kapak",
      seo_title: "Eski başlık | Eonarya Rehber",
      seo_description: "Eski meta açıklaması",
      related_post_ids: [],
      published_at: "2026-09-20T09:00:00.000Z",
      updated_at: "2026-09-20T09:00:00.000Z",
    },
    ...overrides,
  };
}

function plan(operation, target = editorial(), liveRows = []) {
  return makePublicationPlan({ liveRows, target, operation, lockUpdatedAt: LOCK, publicationTime: NOW });
}

test("1 — ilk yayın adayı yalnız kilitli taslaktan snapshot üretir", () => {
  const result = plan("publish");
  assert.equal(result.previousRows.length, 0);
  assert.equal(result.candidateRows.length, 1);
  assert.equal(result.snapshot.title, "Yeni başlık");
  assert.equal(result.snapshot.published_at, LOCK);
  assert.deepEqual(finalPayload(result, "success"), {
    status: "published",
    live_snapshot: result.snapshot,
    published_at: LOCK,
  });
});

test("2 — ilk yayın başarısızlığında yalnız error durumu yazılır", () => {
  assert.deepEqual(finalPayload(plan("publish"), "failure"), { status: "error" });
});

test("3 — yayın güncellemesi adayda yeni, geri dönüşte eski snapshot'ı taşır", () => {
  const old = liveRow();
  const result = plan("publish", editorial({ published_at: old.published_at, live_snapshot: old.live_snapshot }), [old]);
  assert.equal(result.previousRows[0].live_snapshot.title, "Eski başlık");
  assert.equal(result.candidateRows[0].live_snapshot.title, "Yeni başlık");
  assert.equal(result.snapshot.published_at, old.published_at);
  assert.equal(result.snapshot.updated_at, NOW);
});

test("4 — başarısız güncelleme mevcut live_snapshot'ı değiştiren payload üretmez", () => {
  const result = plan("publish", editorial({ live_snapshot: liveRow().live_snapshot, published_at: liveRow().published_at }), [liveRow()]);
  assert.deepEqual(finalPayload(result, "failure"), { status: "error" });
  assert.equal(result.previousRows[0].live_snapshot.content_html, "<p>Eski canlı gövde.</p>");
});

test("5/6 — yayından kaldırma adaydan sayfayı çıkarır, başarısızlık eski sayfayı korur", () => {
  const old = liveRow();
  const result = plan("unpublish", editorial({ live_snapshot: old.live_snapshot, published_at: old.published_at }), [old]);
  assert.equal(result.candidateRows.length, 0);
  assert.equal(result.previousRows.length, 1);
  assert.deepEqual(finalPayload(result, "success"), { status: "draft", live_snapshot: null });
  assert.deepEqual(finalPayload(result, "failure"), { status: "error" });
});

test("7 — eski updated_at kilidi ve publishing olmayan satır reddedilir", () => {
  assert.throws(() => makePublicationPlan({ liveRows: [], target: editorial(), operation: "publish", lockUpdatedAt: "eski", publicationTime: NOW }), /kilidi başka/);
  assert.throws(() => plan("publish", editorial({ status: "error" })), /kilidi artık geçerli değil/);
});

test("8 — başka taslaklar aday public verisine sızmaz", async (t) => {
  const result = plan("publish");
  result.candidateRows.push({ id: "draft", live_snapshot: null, title: "GIZLI-TASLAK", deleted_at: null });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "blog-publication-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await buildBlog({ rows: result.candidateRows, outputDir: directory, fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => "image/jpeg" } }) });
  const html = await fs.readFile(path.join(directory, "blog/ornek-rehber/index.html"), "utf8");
  assert.match(html, /Yeni ve canlı olacak gövde/);
  assert.doesNotMatch(html, /GIZLI-TASLAK/);
});

test("finalizer yalnız eşleşen publishing + updated_at kilidini günceller", async () => {
  const publicationPlan = plan("publish");
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/blog_posts?")) {
      return new Response(JSON.stringify([{ id: publicationPlan.postId, status: "published" }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(null, { status: 201 });
  };
  const result = await finalizePublication({
    plan: publicationPlan,
    result: "success",
    actorUserId: "22222222-2222-4222-8222-222222222222",
    fetchImpl,
    env: { SUPABASE_URL: "https://project.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_test" },
  });
  assert.equal(result.updated, true);
  assert.match(calls[0].url, /status=eq\.publishing/);
  assert.match(calls[0].url, /updated_at=eq\./);
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(JSON.parse(calls[0].init.body).status, "published");
});

test("canlı doğrulama statik HTML'i birebir karşılaştırır ve kaldırılan slug için 404 ister", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "blog-verify-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, "blog"), { recursive: true });
  await fs.writeFile(path.join(directory, "blog/index.html"), "LIST", "utf8");
  await fs.writeFile(path.join(directory, "sitemap.xml"), "MAP", "utf8");
  const responses = new Map([["/blog/", "LIST"], ["/sitemap.xml", "MAP"]]);
  const verified = await verifyOnce({
    siteDir: directory,
    origin: "https://eonarya.com",
    absentSlug: "kaldirilan",
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/blog/kaldirilan/") return new Response("", { status: 404 });
      return new Response(responses.get(pathname) || "wrong", { status: 200 });
    },
  });
  assert.equal(verified, true);
});

test("workflow adayı doğrulamadan final başarı yazmaz ve hata halinde önceki artifact'ı deploy eder", async () => {
  const workflow = await fs.readFile(path.join(__dirname, "../.github/workflows/blog-pages.yml"), "utf8");
  const verifyIndex = workflow.indexOf("Canlı public çıktıyı doğrula");
  const finalizeIndex = workflow.indexOf("Başarılı sonucu kesinleştir");
  assert.ok(verifyIndex > 0 && finalizeIndex > verifyIndex);
  assert.match(workflow, /concurrency:\s+[\s\S]*group: eonarya-blog-publication[\s\S]*cancel-in-progress: false/);
  assert.match(workflow, /Başarısız adaydan önceki public sürüme dön/);
  assert.match(workflow, /artifact_name: github-pages-previous/);
  assert.doesNotMatch(workflow, /manifest|publication_jobs|deployment_jobs/);
});
