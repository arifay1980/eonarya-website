#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { finalizePublication } = require("./blog-publication");

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const result = option("--result");
  const actorUserId = option("--actor-user-id");
  const statePath = path.resolve(option("--state") || ".blog-publication.json");
  let plan;
  try {
    plan = JSON.parse(await fs.readFile(statePath, "utf8"));
  } catch {
    const postId = option("--post-id");
    const operation = option("--operation");
    const lockUpdatedAt = option("--lock-updated-at");
    if (result !== "failure" || !postId || !operation || !lockUpdatedAt) throw new Error("Yayın sonuç bilgisi eksik.");
    plan = { postId, operation, lockUpdatedAt };
  }
  if (!actorUserId || (result !== "success" && result !== "failure")) throw new Error("Yayın sonucu veya aktör eksik.");
  const finalized = await finalizePublication({ plan, result, actorUserId });
  console.log(finalized.updated ? "Yayın durumu güncellendi." : "Eski yayın kilidi değişmiş; sonuç yazılmadı.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
