const fs = require("node:fs/promises");
const path = require("node:path");

const EDITORIAL_FIELDS = [
  "title",
  "slug",
  "summary",
  "content_html",
  "cover_image_path",
  "cover_image_alt",
  "seo_title",
  "seo_description",
  "related_post_ids",
];

function supabaseCredentials(env = process.env) {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const currentSecret = env.SUPABASE_SECRET_KEY;
  const legacySecret = env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = currentSecret || legacySecret;
  if (!url || !secret) throw new Error("SUPABASE_URL ve server-only Supabase secret key gerekli.");
  const headers = { apikey: secret, "Content-Type": "application/json" };
  if (!currentSecret) headers.Authorization = `Bearer ${legacySecret}`;
  return { url, headers };
}

function publicationSnapshot(row, publicationTime) {
  const snapshot = { id: row.id };
  for (const field of EDITORIAL_FIELDS) snapshot[field] = row[field];
  snapshot.published_at = row.published_at || row.updated_at;
  snapshot.updated_at = publicationTime;
  return snapshot;
}

function makePublicationPlan({ liveRows, target, operation, lockUpdatedAt, publicationTime }) {
  if (!target || target.status !== "publishing" || target.deleted_at) {
    throw new Error("Yayın kilidi artık geçerli değil.");
  }
  if (target.updated_at !== lockUpdatedAt) {
    throw new Error("Yayın kilidi başka bir işlem tarafından değiştirilmiş.");
  }
  if (operation !== "publish" && operation !== "unpublish") {
    throw new Error("Geçersiz yayın işlemi.");
  }

  const previousRows = liveRows.filter((row) => row.live_snapshot && !row.deleted_at);
  const previousTarget = previousRows.find((row) => row.id === target.id) || null;
  if (operation === "unpublish" && !previousTarget) {
    throw new Error("Yayından kaldırılacak canlı sürüm bulunamadı.");
  }

  let snapshot = null;
  let candidateRows = previousRows.filter((row) => row.id !== target.id);
  if (operation === "publish") {
    snapshot = publicationSnapshot(target, publicationTime);
    candidateRows = [...candidateRows, {
      id: target.id,
      live_snapshot: snapshot,
      published_at: snapshot.published_at,
      deleted_at: null,
    }];
  }

  return {
    operation,
    postId: target.id,
    lockUpdatedAt,
    slug: operation === "publish" ? target.slug : previousTarget.live_snapshot.slug,
    previousRows,
    candidateRows,
    snapshot,
  };
}

async function fetchJson(url, credentials, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, { headers: credentials.headers });
  if (!response.ok) throw new Error(`Supabase okuması başarısız: HTTP ${response.status}`);
  return response.json();
}

async function loadPublicationPlan({ postId, operation, lockUpdatedAt, publicationTime, fetchImpl = globalThis.fetch, env = process.env }) {
  const credentials = supabaseCredentials(env);
  const liveQuery = new URLSearchParams({
    select: "id,live_snapshot,published_at,deleted_at",
    live_snapshot: "not.is.null",
    deleted_at: "is.null",
    order: "published_at.desc",
  });
  const targetQuery = new URLSearchParams({
    select: `id,${EDITORIAL_FIELDS.join(",")},status,live_snapshot,published_at,updated_at,deleted_at`,
    id: `eq.${postId}`,
    deleted_at: "is.null",
    limit: "1",
  });
  const [liveRows, targets] = await Promise.all([
    fetchJson(`${credentials.url}/rest/v1/blog_posts?${liveQuery}`, credentials, fetchImpl),
    fetchJson(`${credentials.url}/rest/v1/blog_posts?${targetQuery}`, credentials, fetchImpl),
  ]);
  return makePublicationPlan({
    liveRows,
    target: targets[0],
    operation,
    lockUpdatedAt,
    publicationTime,
  });
}

async function copyStaticSite(sourceRoot, outputDir) {
  const excluded = new Set([
    ".git", ".github", "node_modules", "scripts", "tests", "package.json",
    "package-lock.json", "README.md", "_site-candidate", "_site-previous",
  ]);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.cp(sourceRoot, outputDir, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(sourceRoot, source);
      if (!relative) return true;
      return !excluded.has(relative.split(path.sep)[0]);
    },
  });
}

function finalPayload(plan, result) {
  if (result === "failure") return { status: "error" };
  if (result !== "success") throw new Error("Geçersiz yayın sonucu.");
  if (plan.operation === "unpublish") return { status: "draft", live_snapshot: null };
  return {
    status: "published",
    live_snapshot: plan.snapshot,
    published_at: plan.snapshot.published_at,
  };
}

async function writeAudit({ credentials, actorUserId, event, postId, fetchImpl }) {
  const response = await fetchImpl(`${credentials.url}/rest/v1/audit_log`, {
    method: "POST",
    headers: credentials.headers,
    body: JSON.stringify({
      table_name: "admin_actions",
      row_id: null,
      operation: "EVENT",
      actor_role: "service_role",
      actor_uid: actorUserId,
      changed_fields: { event, blog_post_id: postId },
    }),
  });
  if (response.ok) return;
  await fetchImpl(`${credentials.url}/rest/v1/edge_function_errors`, {
    method: "POST",
    headers: credentials.headers,
    body: JSON.stringify({
      function_name: "blog-pages-workflow",
      error_message: "Yayın sonucu audit kaydı yazılamadı.",
      error_code: `http_${response.status}`,
      context: { adim: "blog_yayin_audit", event, blog_post_id: postId },
    }),
  }).catch(() => undefined);
}

async function finalizePublication({ plan, result, actorUserId, fetchImpl = globalThis.fetch, env = process.env }) {
  const credentials = supabaseCredentials(env);
  const query = new URLSearchParams({
    id: `eq.${plan.postId}`,
    status: "eq.publishing",
    updated_at: `eq.${plan.lockUpdatedAt}`,
    select: "id,status,live_snapshot,published_at",
  });
  const response = await fetchImpl(`${credentials.url}/rest/v1/blog_posts?${query}`, {
    method: "PATCH",
    headers: { ...credentials.headers, Prefer: "return=representation" },
    body: JSON.stringify(finalPayload(plan, result)),
  });
  if (!response.ok) throw new Error(`Yayın sonucu kaydedilemedi: HTTP ${response.status}`);
  const rows = await response.json();
  if (rows.length !== 1) {
    if (result === "failure") return { updated: false };
    throw new Error("Yayın kilidi değişti; başarılı sonuç yazılmadı.");
  }
  const event = result === "failure"
    ? plan.operation === "publish" ? "admin_blog_yayin_basarisiz" : "admin_blog_yayindan_kaldirma_basarisiz"
    : plan.operation === "publish" ? "admin_blog_yayinlandi" : "admin_blog_yayindan_kaldirildi";
  await writeAudit({ credentials, actorUserId, event, postId: plan.postId, fetchImpl });
  return { updated: true, row: rows[0] };
}

module.exports = {
  copyStaticSite,
  finalPayload,
  finalizePublication,
  loadPublicationPlan,
  makePublicationPlan,
  publicationSnapshot,
  supabaseCredentials,
};
