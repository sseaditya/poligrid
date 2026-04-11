"use strict";

const fs   = require("fs");
const path = require("path");
const { ROOT, MIME_TYPES } = require("./config");

// ─── HTTP Error helper ────────────────────────────────────────────────────────

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

function extractJsonFromText(text) {
  let parsed = safeJson(text);
  if (parsed) return parsed;

  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let content = match ? match[1].trim() : text;

  const start = content.indexOf("{");
  let end = content.lastIndexOf("}");
  if (start >= 0) {
    if (end < start) end = content.length;

    let slice = content.slice(start, end + 1);
    parsed = safeJson(slice);
    if (parsed) return parsed;

    parsed = safeJson(slice + "]}");
    if (parsed) return parsed;
    parsed = safeJson(slice + "]}]}");
    if (parsed) return parsed;

    parsed = safeJson(slice.replace(/,[^,]*$/, "") + "]}");
    if (parsed) return parsed;

    const lastObjectClose = slice.lastIndexOf("}");
    if (lastObjectClose > 0) {
      parsed = safeJson(slice.slice(0, lastObjectClose + 1) + "]}");
      if (parsed) return parsed;
    }
  }
  return null;
}

function extractResponsesText(response) {
  const output = Array.isArray(response && response.output) ? response.output : [];
  for (const item of output) {
    const content = Array.isArray(item && item.content) ? item.content : [];
    for (const c of content) {
      if (c && c.type === "output_text" && typeof c.text === "string" && c.text.trim()) {
        return c.text.trim();
      }
    }
  }
  for (const item of output) {
    const content = Array.isArray(item && item.content) ? item.content : [];
    for (const c of content) {
      if (c && typeof c.text === "string" && c.text.trim()) {
        return c.text.trim();
      }
    }
  }
  if (typeof response?.output_text === "string") return response.output_text.trim();
  return "";
}

function extractApiError(raw) {
  const parsed = safeJson(raw);
  if (parsed && parsed.error) {
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error.message) return parsed.error.message;
  }
  return raw || "Upstream API error";
}

// ─── API key + base64 helpers ─────────────────────────────────────────────────

function resolveApiKey(override, envValue, envName) {
  const envKey = String(envValue || "").trim();
  if (!envKey) throw httpError(400, `Missing API key. Set ${envName} in .env.local.`);
  return envKey;
}

function decodeBase64Image(imageBase64) {
  try {
    const buffer = Buffer.from(imageBase64, "base64");
    if (!buffer.length) throw new Error("empty buffer");
    return buffer;
  } catch {
    throw httpError(400, "Invalid base64 image payload.");
  }
}

// ─── HTTP request / response helpers ─────────────────────────────────────────

async function readJson(req) {
  const chunks = [];
  let size = 0;
  const maxBytes = 25 * 1024 * 1024;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw httpError(413, "Request body too large.");
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, "Invalid JSON payload.");
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

// ─── Static file server ───────────────────────────────────────────────────────

function serveStatic(pathname, headOnly, res) {
  const normalized = pathname === "/" ? "/index" : pathname;
  const safePath   = path.normalize(decodeURIComponent(normalized));
  const absolute   = path.resolve(ROOT, `.${safePath}`);

  if (!absolute.startsWith(ROOT)) {
    return sendJson(res, 403, { error: "Forbidden path." });
  }

  let filePath = absolute;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  // Support extensionless URLs: /login -> login.html, /index -> index.html
  if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    const withHtml = filePath + ".html";
    if (fs.existsSync(withHtml)) filePath = withHtml;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") return sendJson(res, 404, { error: "Not found." });
      return sendJson(res, 500, { error: "Could not read file." });
    }
    const ext  = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    if (!headOnly) { res.end(data); return; }
    res.end();
  });
}

// ─── Unit conversion helpers ──────────────────────────────────────────────────

/** Convert decimal meters to a feet-inches string, e.g. 3.2 → "10'-6\"" */
function mToFtIn(m) {
  const totalInches = (parseFloat(m) || 0) * 39.3701;
  const feet   = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  if (inches >= 12) return `${feet + 1}'-0"`;
  return `${feet}'-${inches}"`;
}

/** Convert m² to sqft string */
function m2ToSqft(m2) {
  return `${Math.round((parseFloat(m2) || 0) * 10.764)} sqft`;
}

module.exports = {
  httpError,
  safeJson,
  extractJsonFromText,
  extractResponsesText,
  extractApiError,
  resolveApiKey,
  decodeBase64Image,
  readJson,
  sendJson,
  serveStatic,
  mToFtIn,
  m2ToSqft
};
