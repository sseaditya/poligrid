"use strict";

const fs   = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8080);

const DEFAULT_OPENAI_IMAGE_MODEL  = "gpt-image-1.5";
const DEFAULT_OPENAI_TEXT_MODEL   = "gpt-5.4-mini";
const DEFAULT_OPENAI_VISION_MODEL = "gpt-5.4";

const MIME_TYPES = {
  ".html":  "text/html; charset=utf-8",
  ".css":   "text/css; charset=utf-8",
  ".js":    "application/javascript; charset=utf-8",
  ".mjs":   "application/javascript; charset=utf-8",
  ".json":  "application/json; charset=utf-8",
  ".svg":   "image/svg+xml",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".webp":  "image/webp",
  ".ico":   "image/x-icon"
};

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  let raw;
  try { raw = fs.readFileSync(envPath, "utf8"); } catch { return; }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

module.exports = {
  ROOT,
  PORT,
  DEFAULT_OPENAI_IMAGE_MODEL,
  DEFAULT_OPENAI_TEXT_MODEL,
  DEFAULT_OPENAI_VISION_MODEL,
  MIME_TYPES,
  loadEnvFile
};
