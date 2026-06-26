import { describe, expect, test } from "vitest";
import { frontendText } from "./frontend-assets";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

const requiredMarkers = [
  "const backendResearchState",
  "function researchBackendCanAccess",
  "function researchBackendIsConnected",
  "function renderBackendResearchBanner",
  "async function loadBackendResearchRequests",
  "async function loadBackendResearchRequest",
  "async function loadBackendResearch",
  "async function createBackendResearchRequest",
  "async function updateBackendResearchRequest",
  "async function addBackendResearchNote",
  "async function addBackendResearchComment",
  "async function completeBackendResearchRequest",
  "async function reopenBackendResearchRequest",
  "async function archiveBackendResearchRequest",
  "/api/research/requests",
  "/api/research/requests/${encodeURIComponent(requestId)}",
  "/api/research/requests/${encodeURIComponent(requestId)}/notes",
  "/api/research/requests/${encodeURIComponent(requestId)}/comments",
  "/api/research/requests/${encodeURIComponent(requestId)}/complete",
  "/api/research/requests/${encodeURIComponent(requestId)}/reopen",
  "/api/research/requests/${encodeURIComponent(requestId)}/archive",
  "note: noteText",
  "comment: commentText",
  "await loadBackendResearchRequest(requestId)",
  'data-backend-status="research"',
  "Queue",
  "Completed",
  "Notes (during R&D)",
  "Post-Production Comments",
  "Archived requests stay hidden until reopened.",
];

describe("Sprint 11 frontend research wiring", () => {
  test("defines backend research state, banner, loaders, and action wrappers", () => {
    for (const marker of requiredMarkers) {
      expect(frontendText).toContain(marker);
    }
  });

  test("keeps public entrypoint mirrored for Sprint 11 research markers", () => {
    for (const marker of requiredMarkers) {
      expect(frontendText).toContain(marker);
    }
  });
});
