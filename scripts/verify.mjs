#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const GATES = [
  { name: "npm test", cmd: "npm", args: ["test"] },
  { name: "npm run typecheck", cmd: "npm", args: ["run", "typecheck"] },
  { name: "npm run check:deploy-config", cmd: "npm", args: ["run", "check:deploy-config"] },
  { name: "npx wrangler deploy --dry-run", cmd: "npx", args: ["wrangler", "deploy", "--dry-run"] },
];

const results = [];
const startTime = Date.now();

for (const gate of GATES) {
  const gateStart = Date.now();

  console.log(`\n=== ${gate.name} ===\n`);

  const result = spawnSync(gate.cmd, gate.args, {
    stdio: "inherit",
    shell: true,
  });

  const elapsed = ((Date.now() - gateStart) / 1000).toFixed(1);

  if (result.status === 0) {
    console.log(`\n[PASS] ${gate.name}  (${elapsed}s)`);
    results.push({ name: gate.name, passed: true, elapsed });
  } else {
    console.log(`\n[FAIL] ${gate.name}  (${elapsed}s)`);
    results.push({ name: gate.name, passed: false, elapsed });
    console.log(`[STOP] ${gate.name} failed. Remaining gates skipped.\n`);
    break;
  }
}

// Summary
const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log("=".repeat(56));
console.log("  VERIFICATION SUMMARY");
console.log("=".repeat(56));

let passedCount = 0;
let failedCount = 0;
for (const r of results) {
  const label = r.passed ? "PASS" : "FAIL";
  console.log(`  [${label}]  ${r.name}  (${r.elapsed}s)`);
  if (r.passed) passedCount++;
  else failedCount++;
}

const skippedCount = GATES.length - results.length;
if (skippedCount > 0) {
  console.log(`  [SKIP]  ${skippedCount} gate(s) not reached`);
}

console.log("=".repeat(56));
console.log(
  `  Total: ${passedCount} passed, ${failedCount} failed` +
    (skippedCount > 0 ? `, ${skippedCount} skipped` : "") +
    `  |  ${totalTime}s elapsed`,
);
console.log("=".repeat(56));

if (failedCount > 0 || skippedCount > 0) {
  process.exit(1);
}
