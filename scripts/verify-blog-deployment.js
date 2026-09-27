#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function filesUnder(directory, base = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(absolute, base));
    else files.push(path.relative(base, absolute).replaceAll(path.sep, "/"));
  }
  return files;
}

async function verifyOnce({ siteDir, origin, absentSlug, fetchImpl = globalThis.fetch }) {
  const blogFiles = await filesUnder(path.join(siteDir, "blog"));
  const files = ["sitemap.xml", ...blogFiles.map((file) => `blog/${file}`)];
  for (const relative of files) {
    const expected = await fs.readFile(path.join(siteDir, relative), "utf8");
    const pathname = relative.endsWith("/index.html")
      ? `/${relative.slice(0, -"index.html".length)}`
      : relative === "blog/index.html" ? "/blog/" : `/${relative}`;
    const response = await fetchImpl(`${origin}${pathname}?publication_check=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok || await response.text() !== expected) return false;
  }
  if (absentSlug) {
    const response = await fetchImpl(`${origin}/blog/${encodeURIComponent(absentSlug)}/?publication_check=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" },
    });
    if (response.status !== 404) return false;
  }
  return true;
}

async function verifyWithPolling({ siteDir, origin, absentSlug, attempts = 12, waitMs = 5_000, fetchImpl = globalThis.fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (await verifyOnce({ siteDir, origin, absentSlug, fetchImpl })) return true;
    if (attempt < attempts) await wait(waitMs);
  }
  return false;
}

async function main() {
  const siteDir = path.resolve(option("--site") || "_site-candidate");
  const origin = (option("--origin") || "https://eonarya.com").replace(/\/$/, "");
  let absentSlug = option("--absent-slug");
  const statePath = option("--state");
  if (!absentSlug && statePath) {
    const state = JSON.parse(await fs.readFile(path.resolve(statePath), "utf8"));
    if (state.operation === "unpublish") absentSlug = state.slug;
  }
  if (!await verifyWithPolling({ siteDir, origin, absentSlug })) {
    throw new Error("Canlı GitHub Pages çıktısı beklenen statik dosyalarla eşleşmedi.");
  }
  console.log("Canlı GitHub Pages çıktısı doğrulandı.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { verifyOnce, verifyWithPolling };
