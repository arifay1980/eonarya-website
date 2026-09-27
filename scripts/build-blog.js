#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { buildBlog } = require("./blog-generator");

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function fetchLiveRows() {
  const baseUrl = process.env.SUPABASE_URL;
  const currentSecret = process.env.SUPABASE_SECRET_KEY;
  const legacySecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = currentSecret || legacySecret;
  if (!baseUrl || !secret) {
    throw new Error("SUPABASE_URL ve SUPABASE_SECRET_KEY gerekli (legacy fallback: SUPABASE_SERVICE_ROLE_KEY).");
  }
  const query = new URLSearchParams({
    select: "id,live_snapshot,published_at,deleted_at",
    live_snapshot: "not.is.null",
    deleted_at: "is.null",
    order: "published_at.desc",
  });
  const headers = { apikey: secret };
  if (!currentSecret) headers.Authorization = `Bearer ${legacySecret}`;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/blog_posts?${query}`, { headers });
  if (!response.ok) throw new Error(`Yayındaki rehberler alınamadı: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const fixturePath = option("--fixture");
  const outputDir = path.resolve(option("--output") || root);
  const rows = fixturePath
    ? JSON.parse(await fs.readFile(path.resolve(fixturePath), "utf8"))
    : await fetchLiveRows();
  const checkOnly = process.argv.includes("--check");
  const result = await buildBlog({
    rows,
    outputDir,
    supabaseUrl: process.env.SUPABASE_URL,
    write: !checkOnly,
  });

  if (checkOnly) {
    console.log(`Blog üretim kontrolü tamamlandı: ${result.posts.length} canlı içerik, ${result.checkedImageCount} dış gövde görseli.`);
    return;
  }
  console.log(`Blog üretildi: ${result.posts.length} canlı içerik, ${result.files.size} dosya, ${result.checkedImageCount} dış gövde görseli kontrol edildi.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
