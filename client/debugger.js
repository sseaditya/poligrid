// ─── API Inspector (Debug Logger) ────────────────────────────────────────────
const Debugger = {
  _seq:     0,
  _pSeq:    0,
  _pending: new Map(),   // pSeq → { el, label, startTime }
  _logs:    [],          // full log archive for download

  // ── Show a pending "waiting" entry immediately when a request starts ────────
  pending(label) {
    const id   = ++Debugger._pSeq;
    const time = new Date().toLocaleTimeString();
    const el_  = document.createElement('details');
    el_.className = 'dbg-entry dbg-pending';
    el_.open = false;
    el_.innerHTML = `
      <summary class="dbg-summary">
        <span class="dbg-seq">…</span>
        <span class="dbg-step-name">${escapeHtml(label)}</span>
        <span class="dbg-spinner">⟳</span>
        <span class="dbg-time">${time}</span>
      </summary>
      <div class="dbg-body"><div class="dbg-pending-msg">Waiting for OpenAI response…</div></div>`;
    const content = el('debugContent');
    if (content) content.prepend(el_);
    Debugger._pending.set(id, { el: el_, label, startTime: Date.now() });
    return id;
  },

  // ── Resolve a pending entry: remove spinner, log actual debug items ─────────
  resolvePending(pendingId, debugItems, error) {
    const p = Debugger._pending.get(pendingId);
    if (p) {
      p.el.remove();
      Debugger._pending.delete(pendingId);
    }
    if (error) {
      Debugger._addEntry(p?.label || 'API Call', {}, { error: { message: error.message } });
    } else if (debugItems && debugItems.length) {
      // Log each OpenAI sub-call (newest first order preserved by prepend in _addEntry)
      for (let i = debugItems.length - 1; i >= 0; i--) {
        const d = debugItems[i];
        Debugger._addEntry(d.step, d.payload, d.response);
      }
    }
  },

  // ── Core method: build one collapsible entry for a single OpenAI call ───────
  _addEntry(step, payload, response) {
    const content = el('debugContent');
    if (!content) return;

    const seq     = ++Debugger._seq;
    const time    = new Date().toLocaleTimeString();
    const model   = payload?.model || '—';
    const isError = !!(response?.error);
    const effort  = payload?.reasoning?.effort || null;
    const maxTok  = payload?.max_output_tokens || null;

    // Extract rich data before sanitising
    const promptText = Debugger._promptText(payload);
    const sentImgs   = Debugger._sentImages(payload);
    const respText   = Debugger._responseText(response);
    const respImg    = Debugger._responseImage(response);
    const usage      = response?.usage || null;

    // Archive for download
    Debugger._logs.push({ seq, step, time, model, promptText, respText, usage, isError });

    const safePayload  = Debugger._sanitize(payload  || {});
    const safeResponse = Debugger._sanitize(response || {});

    const thumbs = srcs => srcs.map(s =>
      `<img class="dbg-thumb" src="${s}" title="Click to zoom" onclick="this.classList.toggle('dbg-thumb-zoom')" />`
    ).join('');

    const metaTag = (lbl, val) =>
      `<span class="dbg-meta-tag">${escapeHtml(lbl)}: <b>${escapeHtml(String(val))}</b></span>`;

    const rawBlock = (lbl, obj) => `
      <details class="dbg-raw">
        <summary>${escapeHtml(lbl)}</summary>
        <pre class="dbg-pre">${escapeHtml(JSON.stringify(obj, null, 2))}</pre>
      </details>`;

    const sentMeta = [
      metaTag('model', model),
      effort ? metaTag('reasoning', effort) : '',
      maxTok ? metaTag('max_tokens', maxTok) : '',
      sentImgs.length ? metaTag('images_sent', sentImgs.length) : '',
    ].filter(Boolean).join('');

    const sentBody = `
      <div class="dbg-meta-row">${sentMeta}</div>
      ${promptText ? `<div class="dbg-label">Prompt</div><pre class="dbg-prompt-pre">${escapeHtml(promptText)}</pre>` : ''}
      ${sentImgs.length ? `<div class="dbg-label">Images sent (${sentImgs.length})</div><div class="dbg-thumbs">${thumbs(sentImgs)}</div>` : ''}
      ${rawBlock('Raw request JSON', safePayload)}`;

    const usageHtml = usage
      ? `<div class="dbg-usage">↑ ${usage.input_tokens ?? '?'} in &nbsp;·&nbsp; ↓ ${usage.output_tokens ?? '?'} out</div>`
      : '';

    const recvBody = `
      ${respText ? `<div class="dbg-label">Output text</div><pre class="dbg-resp-pre">${escapeHtml(respText)}</pre>` : ''}
      ${respImg  ? `<div class="dbg-label">Generated image</div><div class="dbg-thumbs">${thumbs([respImg])}</div>` : ''}
      ${usageHtml}
      ${isError  ? `<div class="dbg-error">${escapeHtml(JSON.stringify(response?.error))}</div>` : ''}
      ${rawBlock('Raw response JSON', safeResponse)}`;

    const entry = document.createElement('details');
    entry.className = 'dbg-entry';
    entry.open = true;
    entry.innerHTML = `
      <summary class="dbg-summary">
        <span class="dbg-seq">#${seq}</span>
        <span class="dbg-step-name">${escapeHtml(step)}</span>
        <span class="dbg-model-pill">${escapeHtml(model)}</span>
        <span class="dbg-time">${time}</span>
        <span class="dbg-status-dot ${isError ? 'err' : 'ok'}">${isError ? '✗' : '✓'}</span>
      </summary>
      <div class="dbg-body">
        <details class="dbg-section" open>
          <summary class="dbg-section-head sent">→ Sent to OpenAI</summary>
          <div class="dbg-section-body">${sentBody}</div>
        </details>
        <details class="dbg-section" open>
          <summary class="dbg-section-head recv">← Received from OpenAI</summary>
          <div class="dbg-section-body">${recvBody}</div>
        </details>
      </div>`;

    content.prepend(entry);

    const badge = el('dbgCount');
    if (badge) badge.textContent = Debugger._seq;
  },

  // ── Extract prompt text from a responses-API or image-gen payload ──────────
  _promptText(payload) {
    const content = payload?.input?.[0]?.content;
    if (Array.isArray(content)) {
      const t = content.find(c => c.type === 'input_text');
      if (t?.text) return t.text;
    }
    if (typeof payload?.prompt === 'string') return payload.prompt;
    return '';
  },

  // ── Extract sent image data URLs ───────────────────────────────────────────
  _sentImages(payload) {
    const content = payload?.input?.[0]?.content;
    if (!Array.isArray(content)) return [];
    return content
      .filter(c => c.type === 'input_image' && typeof c.image_url === 'string' && c.image_url.startsWith('data:'))
      .map(c => c.image_url);
  },

  // ── Extract text output from a responses-API reply ─────────────────────────
  _responseText(response) {
    if (Array.isArray(response?.output)) {
      for (const out of response.output) {
        if (out.type === 'message') {
          const t = (out.content || []).find(c => c.type === 'output_text');
          if (t?.text) return t.text;
        }
      }
    }
    return '';
  },

  // ── Extract generated image from image-gen/edit response ──────────────────
  _responseImage(response) {
    const b64 = response?.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  },

  // ── Replace base64 blobs with size labels so raw JSON is readable ──────────
  _sanitize(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(v => Debugger._sanitize(v));
    const out = {};
    for (const k in obj) {
      const v = obj[k];
      if (typeof v === 'string' && v.length > 300 &&
          (v.startsWith('data:image') || /^[A-Za-z0-9+/]{200}/.test(v))) {
        out[k] = `[image ~${Math.round(v.length * 0.75 / 1024)}KB]`;
      } else if (typeof v === 'object') {
        out[k] = Debugger._sanitize(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  },

  // ── Download all logs as JSON ──────────────────────────────────────────────
  download() {
    const data = JSON.stringify(Debugger._logs, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `poligrid-logs-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    a.click();
  },

  // ── Clear all entries ──────────────────────────────────────────────────────
  clear() {
    const content = el('debugContent');
    if (content) content.innerHTML = '';
    Debugger._seq  = 0;
    Debugger._pSeq = 0;
    Debugger._logs = [];
    Debugger._pending.clear();
    const badge = el('dbgCount');
    if (badge) badge.textContent = '0';
  }
};
