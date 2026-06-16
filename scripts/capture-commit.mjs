#!/usr/bin/env node
// Git post-commit capture for Autonomous Alfred's self-documenting engine.
// Posts the latest commit (subject, body, changed-files summary) to the OS
// capture buffer so the evening self-doc pass can draft content from it.
//
// Silent + non-blocking by design: if the env isn't configured or the network
// is down, it exits 0 and never gets in the way of committing.
//
// Setup (once):
//   git config core.hooksPath .githooks
//   export ALFRED_CAPTURE_URL="https://<your-app>/api/alfred/capture"
//   export ALFRED_CAPTURE_SECRET="<same as ALFRED_CAPTURE_SECRET in the app env>"
import { execSync } from "node:child_process";

const url = process.env.ALFRED_CAPTURE_URL;
const secret = process.env.ALFRED_CAPTURE_SECRET;
if (!url || !secret) process.exit(0);

function git(args) {
  try { return execSync(`git ${args}`, { encoding: "utf8" }).trim(); }
  catch { return ""; }
}

const subject = git("log -1 --pretty=%s");
const bodyText = git("log -1 --pretty=%b");
const stat = git("show --stat --format= HEAD").slice(0, 4000);
if (!subject) process.exit(0);

const payload = {
  kind: "commit",
  title: subject,
  body: [bodyText, stat].filter(Boolean).join("\n\n"),
  meta: { sha: git("rev-parse --short HEAD"), branch: git("rev-parse --abbrev-ref HEAD") },
};

// Fire-and-forget with a short timeout. Never block the commit.
const controller = new AbortController();
const t = setTimeout(() => controller.abort(), 5000);
fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
  body: JSON.stringify(payload),
  signal: controller.signal,
})
  .catch(() => {})
  .finally(() => { clearTimeout(t); process.exit(0); });
