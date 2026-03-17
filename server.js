const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8080);
const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1";
const DEFAULT_OPENAI_TEXT_MODEL = "gpt-4.1-mini";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

loadEnvFile(path.join(ROOT, ".env.local"));

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "POST" && url.pathname === "/api/render/openai") {
      const body = await readJson(req);
      const result = await renderWithOpenAi(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/style/extract") {
      const body = await readJson(req);
      const result = await extractStyleWithOpenAi(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(url.pathname, req.method === "HEAD", res);
    }

    return sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    const message = error && error.message ? error.message : "Server error";
    const status = Number(error && error.statusCode) || 500;
    return sendJson(res, status, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`Interior planner server running on http://localhost:${PORT}`);
});

async function renderWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || DEFAULT_OPENAI_IMAGE_MODEL).trim();
  const prompt = String(body.prompt || "").trim();
  const imageBase64 = String(body.imageBase64 || "").trim();
  const mimeType = String(body.mimeType || "image/png").trim();
  const quality = "low";

  if (!prompt || !imageBase64) {
    throw httpError(400, "Missing prompt or imageBase64 for OpenAI render.");
  }

  const imageBuffer = decodeBase64Image(imageBase64);
  const form = new FormData();
  form.append("model", model);
  form.append("quality", quality);
  form.append("prompt", prompt);
  form.append("image", new Blob([imageBuffer], { type: mimeType }), "room_input.png");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  const raw = await response.text();
  if (!response.ok) {
    throw httpError(response.status, extractApiError(raw));
  }

  const parsed = safeJson(raw);
  const firstImage = Array.isArray(parsed && parsed.data) ? parsed.data[0] : null;
  if (!firstImage) {
    throw httpError(502, "OpenAI response did not include image data.");
  }

  if (firstImage.b64_json) {
    return {
      provider: "openai",
      model,
      dataUrl: `data:image/png;base64,${firstImage.b64_json}`
    };
  }

  if (firstImage.url) {
    return {
      provider: "openai",
      model,
      dataUrl: firstImage.url
    };
  }

  throw httpError(502, "OpenAI response did not include b64_json or url.");
}

async function extractStyleWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || DEFAULT_OPENAI_TEXT_MODEL).trim();
  const roomLabel = String(body.roomLabel || "").trim();
  const brief = String(body.brief || "").trim();
  const inspirationImages = Array.isArray(body.inspirationImages) ? body.inspirationImages : [];

  if (!brief) {
    throw httpError(400, "Missing brief for style extraction.");
  }

  const content = [];
  content.push({
    type: "input_text",
    text: [
      "You are an interior designer + production estimator for Indian modular / plywood + laminate interiors.",
      "Goal: extract a standardized style direction and propose a laminate finish selection + furniture requirements for THIS room.",
      "Return STRICT JSON only (no markdown).",
      "",
      `Room: ${roomLabel || "Unknown room"}`,
      `Brief: ${brief}`,
      "",
      "JSON schema:",
      "{",
      '  "style_summary": string,',
      '  "finish_palette": { "primary": string, "secondary": string, "accent": string },',
      '  "laminate_recommendation": { "name": string, "tone": string, "finish": "matte"|"gloss"|"textured", "notes": string },',
      '  "furniture_requirements": [ { "module": string, "notes": string } ],',
      '  "do_not_do": [ string ]',
      "}",
      "",
      "Keep laminate recommendation generic (do NOT reference catalog codes).",
      "Furniture requirements should be concise and feasible for a typical apartment.",
      "If inspiration images conflict with brief, prioritize brief but mention the conflict in do_not_do."
    ].join("\n")
  });

  for (const img of inspirationImages.slice(0, 8)) {
    const mimeType = String(img && img.mimeType ? img.mimeType : "image/jpeg");
    const data = String(img && img.base64 ? img.base64 : "");
    if (!data) continue;
    content.push({
      type: "input_image",
      image_url: `data:${mimeType};base64,${data}`
    });
  }

  const payload = {
    model,
    input: [{ role: "user", content }],
    max_output_tokens: 700
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  if (!response.ok) {
    throw httpError(response.status, extractApiError(raw));
  }

  const parsed = safeJson(raw);
  const text = extractResponsesText(parsed);
  const json = safeJson(text);
  if (!json) {
    throw httpError(502, "Style extraction returned non-JSON output.");
  }

  return {
    provider: "openai",
    model,
    style: json
  };
}

function resolveApiKey(override, envValue, envName) {
  const envKey = String(envValue || "").trim();
  if (!envKey) {
    throw httpError(400, `Missing API key. Set ${envName} in .env.local.`);
  }
  return envKey;
}

function decodeBase64Image(imageBase64) {
  try {
    const buffer = Buffer.from(imageBase64, "base64");
    if (!buffer.length) {
      throw new Error("empty buffer");
    }
    return buffer;
  } catch {
    throw httpError(400, "Invalid base64 image payload.");
  }
}

function serveStatic(pathname, headOnly, res) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(decodeURIComponent(normalized));
  const absolute = path.resolve(ROOT, `.${safePath}`);

  if (!absolute.startsWith(ROOT)) {
    return sendJson(res, 403, { error: "Forbidden path." });
  }

  let filePath = absolute;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        return sendJson(res, 404, { error: "Not found." });
      }
      return sendJson(res, 500, { error: "Could not read file." });
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store"
    });
    if (!headOnly) {
      res.end(data);
      return;
    }
    res.end();
  });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  const maxBytes = 25 * 1024 * 1024;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw httpError(413, "Request body too large.");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {};
  }

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

function extractApiError(raw) {
  const parsed = safeJson(raw);
  if (parsed && parsed.error) {
    if (typeof parsed.error === "string") {
      return parsed.error;
    }
    if (parsed.error.message) {
      return parsed.error.message;
    }
  }
  return raw || "Upstream API error";
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractResponsesText(response) {
  const output = Array.isArray(response && response.output) ? response.output : [];
  for (const item of output) {
    const content = Array.isArray(item && item.content) ? item.content : [];
    for (const c of content) {
      if (c && typeof c.text === "string" && c.text.trim()) {
        return c.text.trim();
      }
      if (c && c.type === "output_text" && typeof c.text === "string" && c.text.trim()) {
        return c.text.trim();
      }
    }
  }
  // fallback: some variants store in response.output_text
  if (typeof response?.output_text === "string") {
    return response.output_text.trim();
  }
  return "";
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }
  let raw;
  try {
    raw = fs.readFileSync(envPath, "utf8");
  } catch (error) {
    // In some sandboxed/dev environments this file may be blocked; do not crash the server.
    return;
  }
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
