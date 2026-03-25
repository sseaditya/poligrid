"use strict";

// ─── Supabase Client ─────────────────────────────────────────────────────────
// Lazy-initialised so missing env vars don't crash the server on startup.

let _createClient;
function _loadSupabase() {
  if (!_createClient) {
    try {
      _createClient = require("@supabase/supabase-js").createClient;
    } catch {
      throw new Error(
        "@supabase/supabase-js not installed. Run: npm install @supabase/supabase-js"
      );
    }
  }
  return _createClient;
}

let _client = null;
function getClient() {
  if (!_client) {
    const createClient = _loadSupabase();
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local"
      );
    }
    _client = createClient(url, key, { auth: { persistSession: false } });
  }
  return _client;
}

// ─── Storage Helpers ─────────────────────────────────────────────────────────

function _base64ToBuffer(b64) {
  const data = b64 && b64.includes("base64,") ? b64.split("base64,")[1] : b64;
  return Buffer.from(data, "base64");
}

async function _uploadBuffer(bucket, storagePath, buffer, contentType) {
  const sb = getClient();
  const { error } = await sb.storage
    .from(bucket)
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) {
    console.error(`[DB] Storage upload failed (${bucket}/${storagePath}):`, error.message);
    return null;
  }
  return storagePath;
}

async function uploadBase64(bucket, storagePath, base64, mimeType = "image/png") {
  if (!base64) return null;
  return _uploadBuffer(bucket, storagePath, _base64ToBuffer(base64), mimeType);
}

async function uploadText(bucket, storagePath, text, contentType = "text/plain; charset=utf-8") {
  if (!text) return null;
  return _uploadBuffer(bucket, storagePath, Buffer.from(text, "utf8"), contentType);
}

// ─── Row Helpers ─────────────────────────────────────────────────────────────

async function insertRow(table, data) {
  const sb = getClient();
  const { data: row, error } = await sb.from(table).insert(data).select("id").single();
  if (error) { console.error(`[DB] Insert ${table} failed:`, error.message); return null; }
  return row?.id ?? null;
}

async function upsertProject(projectId, data) {
  const sb = getClient();
  const { error } = await sb
    .from("projects")
    .upsert({ id: projectId, ...data }, { onConflict: "id" });
  if (error) console.error("[DB] Upsert project failed:", error.message);
}

// Delete all matching rows then re-insert. Used to replace a project's child records.
async function replaceRows(table, filter, rows) {
  const sb = getClient();
  let q = sb.from(table).delete();
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { error: delErr } = await q;
  if (delErr) { console.error(`[DB] Delete ${table} failed:`, delErr.message); return; }
  if (!rows || rows.length === 0) return;
  const { error: insErr } = await sb.from(table).insert(rows);
  if (insErr) console.error(`[DB] Re-insert ${table} failed:`, insErr.message);
}

// Upsert a camera pin using (project_id, client_id) as unique key.
async function upsertPin(projectId, pinData) {
  const sb = getClient();
  const { error } = await sb
    .from("camera_pins")
    .upsert(pinData, { onConflict: "project_id,client_id" });
  if (error) console.error("[DB] Upsert pin failed:", error.message);
}

module.exports = { getClient, uploadBase64, uploadText, insertRow, upsertProject, replaceRows, upsertPin };
