import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const projectRoot = resolve(repoRoot, "..");

const docPaths = {
  session: resolve(projectRoot, "session-state.md"),
  workboard: resolve(projectRoot, "phase-2b", "workboard.md"),
  readme: resolve(projectRoot, "phase-2b", "README.md"),
  operatorDashboard: resolve(projectRoot, "phase-2b", "operator-dashboard.md"),
  blockers: resolve(projectRoot, "phase-2b", "blockers.md"),
  verification: resolve(projectRoot, "phase-2b", "test-and-verification-plan.md"),
};

const docs = Object.fromEntries(
  Object.entries(docPaths).map(([key, path]) => [key, readDoc(path)]),
);

const gitStatus = spawnSync("git", ["status", "--short", "--branch"], {
  cwd: repoRoot,
  encoding: "utf8",
});

printHeader("Nut House Ops Status");
printSection("Workflow", [
  `Step: ${firstMatch([docs.session.text, docs.workboard.text], /^Current workflow step:\s*(.+)$/im) ?? firstMatch([docs.workboard.text], /^Workflow step:\s*(.+)$/im) ?? "Unknown"}`,
  `Phase: ${firstMatch([docs.session.text, docs.workboard.text], /^Current phase:\s*(.+)$/im) ?? "Unknown"}`,
]);

printSection("Operator Dashboard", [
  `Current request: ${dashboardValue("Current request", docs.operatorDashboard.text)}`,
  `Primary intake bucket: ${dashboardValue("Primary intake bucket", docs.operatorDashboard.text)}`,
  `Secondary buckets: ${dashboardValue("Secondary buckets", docs.operatorDashboard.text)}`,
  `Primary owner: ${dashboardValue("Primary owner", docs.operatorDashboard.text)}`,
  `Next action: ${dashboardValue("Next action", docs.operatorDashboard.text)}`,
  `Blocker: ${dashboardValue("Blocker", docs.operatorDashboard.text)}`,
  `Verification gate: ${dashboardValue("Verification gate", docs.operatorDashboard.text)}`,
  `Updated: ${dashboardValue("Updated", docs.operatorDashboard.text)}`,
]);

printSection("URLs", [
  `Staging: ${findUrl("Staging") ?? "Unknown"}`,
  `Production: ${findUrl("Production") ?? "Unknown"}`,
  `Production-mode Worker reference: ${findUrl("Production-mode Worker reference") ?? findUrl("Production-mode Worker") ?? "Unknown"}`,
]);

printSection("Branch / Dirty State", formatGitStatus(gitStatus));

printSection("Blockers / Approval Gates", [
  ...extractCurrentOpenWork(docs.workboard.text),
  ...extractRemoteGates(docs.blockers.text),
  ...extractSendGridGate(docs.blockers.text),
]);

printSection("Suggested Verification", suggestedVerification());

printSection("Approval Reminder", [
  "Warn-only console: this command performs no writes, remote calls, deploys, migrations, or email sends.",
  "Stop for General confirmation before push, deploy, remote migration, remote smoke, SendGrid setup/send, production user changes, or custom-domain/DNS/certificate work.",
]);

const missingDocs = Object.entries(docs)
  .filter(([, doc]) => !doc.exists)
  .map(([key, doc]) => `${key}: ${relativeToRepo(doc.path)}`);

if (missingDocs.length > 0) {
  printSection("Missing Docs", missingDocs);
}

process.exit(0);

function readDoc(path) {
  if (!existsSync(path)) {
    return { exists: false, path, text: "" };
  }

  try {
    return { exists: true, path, text: readFileSync(path, "utf8") };
  } catch (error) {
    return {
      exists: false,
      path,
      text: `Unable to read ${path}: ${error.message}`,
    };
  }
}

function firstMatch(texts, pattern) {
  for (const text of texts) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return clean(match[1]);
    }
  }

  return null;
}

function dashboardValue(label, text) {
  if (!text) {
    return "Unknown";
  }

  const pattern = new RegExp(`^${escapeRegex(label)}:\\s*(.*)$`, "im");
  const match = text.match(pattern);
  if (!match) {
    return "Unknown";
  }

  const value = clean(match[1]);
  return value.length > 0 ? value : "Unknown";
}

function findUrl(label) {
  const pattern = new RegExp(`${escapeRegex(label)}[^\\n]*?(https://\\S+)`, "i");
  const url = firstMatch([docs.session.text, docs.workboard.text, docs.readme.text], pattern);
  return url?.replace(/[)`.,;]+$/, "") ?? null;
}

function formatGitStatus(result) {
  if (result.error) {
    return [`WARN: unable to run git status: ${result.error.message}`];
  }

  if (result.status !== 0) {
    return [
      `WARN: git status exited ${result.status}`,
      ...splitLines(result.stderr || result.stdout).slice(0, 8),
    ];
  }

  const lines = splitLines(result.stdout);
  if (lines.length === 1) {
    return [lines[0], "Working tree appears clean."];
  }

  return lines.slice(0, 20);
}

function extractCurrentOpenWork(text) {
  const snapshot = sectionBetween(text, "## Current Open Work", "### 2026-");
  const items = splitLines(snapshot)
    .filter((line) => line.trim().startsWith("- [ ]"))
    .map((line) => clean(line.replace("- [ ]", "")))
    .slice(0, 5);

  return items.length > 0 ? items : ["No open-work checklist items found in current workboard section."];
}

function extractRemoteGates(text) {
  const section = sectionBetween(text, "## Remote Action Gates", "## Production / Custom Domain");
  const gates = splitLines(section)
    .filter((line) => line.trim().startsWith("- "))
    .map((line) => `Approval required before ${clean(line.replace(/^- /, "")).replace(/\.$/, "")}.`)
    .slice(0, 8);

  return gates.length > 0 ? gates : ["Remote approval gates not found in blockers doc."];
}

function extractSendGridGate(text) {
  const section = sectionBetween(text, "## SendGrid Real Email Sending", "");
  if (!section) {
    return ["SendGrid approval gate not found in blockers doc."];
  }

  const gateLines = splitLines(section)
    .filter((line) => /Do not|No live send|Real sending is disabled/i.test(line))
    .map((line) => clean(line.replace(/^- /, "")))
    .slice(0, 4);

  return gateLines.length > 0 ? gateLines : ["SendGrid live sending remains approval-gated."];
}

function suggestedVerification() {
  const plan = docs.verification.text;
  const standardGate =
    sectionBetween(plan, "### Backend, frontend, config, or migration changes", "### Production/auth/config hardening") ||
    "";
  const commands = splitLines(standardGate)
    .filter((line) => /^(npm|npx|node)\s/.test(line.trim()))
    .map((line) => line.trim());

  const uniqueCommands = [...new Set(commands)];
  return [
    "For this read-only tooling change: node --check scripts/status-ops.mjs; npm run status:ops.",
    ...(uniqueCommands.length > 0
      ? uniqueCommands.map((command) => `Shared app/config gate when scope warrants: ${command}`)
      : ["Shared app/config gates not found in verification plan."]),
    "Remote, R2, SendGrid, migration, deploy, and custom-domain smoke only after explicit approval.",
  ];
}

function sectionBetween(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading);
  if (start === -1) {
    return "";
  }

  const fromStart = text.slice(start + startHeading.length);
  if (!endHeading) {
    return fromStart;
  }

  const end = fromStart.indexOf(endHeading);
  return end === -1 ? fromStart : fromStart.slice(0, end);
}

function splitLines(text) {
  return text.split(/\r?\n/).map(clean).filter(Boolean);
}

function clean(value) {
  return value.replace(/\s+/g, " ").trim();
}

function printHeader(title) {
  console.log(title);
  console.log("=".repeat(title.length));
}

function printSection(title, lines) {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));
  for (const line of lines.length > 0 ? lines : ["None found."]) {
    console.log(`- ${line}`);
  }
}

function relativeToRepo(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
