import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..");

function readText(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function readFilesRecursive(root: string, extension: string): string {
  if (!existsSync(root)) return "";
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const fullPath = resolve(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (fullPath.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  };
  walk(root);
  return files.map(readText).join("\n");
}

export const rootHtml = readText(resolve(repoRoot, "index.html"));
export const publicHtml = readText(resolve(repoRoot, "public", "index.html"));
export const publicStyles = [
  readText(resolve(repoRoot, "public", "styles.css")),
  readFilesRecursive(resolve(repoRoot, "public", "css"), ".css"),
].join("\n");
export const publicApp = [
  readText(resolve(repoRoot, "public", "app.js")),
  readFilesRecursive(resolve(repoRoot, "public", "js"), ".js"),
].join("\n");

export const frontendText = [rootHtml, publicHtml, publicStyles, publicApp].join("\n");
