#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { buildBlog } = require("./blog-generator");
const { copyStaticSite, loadPublicationPlan } = require("./blog-publication");

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const postId = option("--post-id");
  const operation = option("--operation");
  const lockUpdatedAt = option("--lock-updated-at");
  const candidateDir = path.resolve(option("--candidate") || "_site-candidate");
  const previousDir = path.resolve(option("--previous") || "_site-previous");
  const statePath = path.resolve(option("--state") || ".blog-publication.json");
  if (!postId || !operation || !lockUpdatedAt) throw new Error("Yayın kimliği, işlemi ve kilidi zorunlu.");

  const sourceRoot = path.resolve(__dirname, "..");
  const plan = await loadPublicationPlan({
    postId,
    operation,
    lockUpdatedAt,
    publicationTime: new Date().toISOString(),
  });
  await copyStaticSite(sourceRoot, previousDir);
  await copyStaticSite(sourceRoot, candidateDir);
  await buildBlog({ rows: plan.previousRows, outputDir: previousDir, supabaseUrl: process.env.SUPABASE_URL });
  await buildBlog({ rows: plan.candidateRows, outputDir: candidateDir, supabaseUrl: process.env.SUPABASE_URL });
  await fs.writeFile(statePath, `${JSON.stringify(plan)}\n`, "utf8");
  console.log(`Yayın adayı hazır: ${operation}, ${plan.candidateRows.length} canlı içerik.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
