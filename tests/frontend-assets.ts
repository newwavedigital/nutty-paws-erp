import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..");

export const rootHtml = readFileSync(resolve(repoRoot, "index.html"), "utf8");
export const publicHtml = readFileSync(resolve(repoRoot, "public", "index.html"), "utf8");
export const publicStyles = readFileSync(resolve(repoRoot, "public", "styles.css"), "utf8");
export const publicApp = readFileSync(resolve(repoRoot, "public", "app.js"), "utf8");

export const frontendText = [rootHtml, publicHtml, publicStyles, publicApp].join("\n");
