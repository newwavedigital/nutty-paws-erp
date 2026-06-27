#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoots = [
  resolve(repoRoot, "public", "app.js"),
  resolve(repoRoot, "public", "js"),
];

function collectJavaScriptFiles(path) {
  if (statSync(path).isFile()) return path.endsWith(".js") ? [path] : [];

  return readdirSync(path)
    .sort()
    .flatMap((entry) => collectJavaScriptFiles(resolve(path, entry)));
}

const files = frontendRoots.flatMap(collectJavaScriptFiles);
let failed = false;

for (const file of files) {
  const relative = file.slice(repoRoot.length + 1);
  const result = spawnSync("node", ["--check", file], {
    shell: true,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (result.status === 0) {
    console.log(`[PASS] ${relative}`);
  } else {
    failed = true;
    console.error(`[FAIL] ${relative}`);
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
  }
}

if (failed) process.exit(1);

console.log(`[PASS] ${files.length} frontend JavaScript file(s) parsed`);
