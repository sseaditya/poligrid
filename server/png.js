"use strict";

const zlib = require("zlib");

// ─── Minimal pure-JS PNG encoder (no native dependencies) ────────────────────

const _CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function _crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = _CRC32_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function _u32be(n) {
  return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];
}

function _makePngChunk(type, data) {
  const tb      = Buffer.from(type, "ascii");
  const crcSrc  = Buffer.concat([tb, data]);
  return Buffer.concat([
    Buffer.from(_u32be(data.length)),
    tb,
    data,
    Buffer.from(_u32be(_crc32(crcSrc)))
  ]);
}

function _encodePng(pixels, w, h) {
  // pixels: Buffer, RGBA, w*h*4 bytes
  const PNG_SIG   = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr      = _makePngChunk("IHDR", Buffer.from([..._u32be(w), ..._u32be(h), 8, 6, 0, 0, 0]));
  const scanlines = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 4);
    scanlines[row] = 0; // filter: None
    pixels.copy(scanlines, row + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = _makePngChunk("IDAT", zlib.deflateSync(scanlines, { level: 1 }));
  const iend = _makePngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([PNG_SIG, ihdr, idat, iend]);
}

/**
 * Create a bird's-eye camera-position diagram as a base64 PNG.
 * Shows room boundary, camera dot (red), and FOV cone (blue).
 */
function createCameraAnnotationPng(roomWidthM, roomLengthM, camXM, camYM, angleDeg, fovDeg) {
  const W = 220, H = 220;
  const pix = Buffer.alloc(W * H * 4, 255); // white, opaque

  function sp(x, y, r, g, b) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    pix[i] = r; pix[i + 1] = g; pix[i + 2] = b; pix[i + 3] = 255;
  }

  function line(x0, y0, x1, y1, r, g, b, thickness = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (let i = 0; i < 1000; i++) {
      for (let t = -Math.floor(thickness / 2); t <= Math.floor(thickness / 2); t++) {
        if (dx > dy) sp(x0, y0 + t, r, g, b); else sp(x0 + t, y0, r, g, b);
      }
      sp(x0, y0, r, g, b);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx)  { err += dx; y0 += sy; }
    }
  }

  function fillRect(x0, y0, x1, y1, r, g, b) {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++)
        sp(x, y, r, g, b);
  }

  function fillCircle(cx, cy, radius, r, g, b) {
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        if (dx * dx + dy * dy <= radius * radius) sp(cx + dx, cy + dy, r, g, b);
  }

  const pad = 20;
  const rw  = W - pad * 2;
  const rh  = H - pad * 2;

  fillRect(pad, pad, pad + rw, pad + rh, 240, 240, 240);
  for (let t = 0; t < 2; t++) {
    for (let x = pad - t; x <= pad + rw + t; x++) {
      sp(x, pad - t, 80, 80, 80); sp(x, pad + rh + t, 80, 80, 80);
    }
    for (let y = pad - t; y <= pad + rh + t; y++) {
      sp(pad - t, y, 80, 80, 80); sp(pad + rw + t, y, 80, 80, 80);
    }
  }

  const fracX   = roomWidthM  ? Math.min(Math.max(camXM / roomWidthM,  0.05), 0.95) : 0.5;
  const fracY   = roomLengthM ? Math.min(Math.max(camYM / roomLengthM, 0.05), 0.95) : 0.5;
  const cx      = Math.round(pad + fracX * rw);
  const cy      = Math.round(pad + fracY * rh);

  const coneLen  = Math.min(rw, rh) * 0.45;
  const halfFov  = ((fovDeg || 60) / 2) * Math.PI / 180;
  const baseAngle = ((angleDeg || 0) - 90) * Math.PI / 180;
  const la       = baseAngle - halfFov;
  const ra       = baseAngle + halfFov;
  const ex1 = cx + Math.cos(la) * coneLen;
  const ey1 = cy + Math.sin(la) * coneLen;
  const ex2 = cx + Math.cos(ra) * coneLen;
  const ey2 = cy + Math.sin(ra) * coneLen;

  const steps = 30;
  for (let s = 0; s <= steps; s++) {
    const a = la + (ra - la) * (s / steps);
    for (let d = 0; d <= coneLen; d += 1.5) {
      sp(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 180, 210, 240);
    }
  }

  line(cx, cy, ex1, ey1, 0, 80, 180, 2);
  line(cx, cy, ex2, ey2, 0, 80, 180, 2);
  line(ex1, ey1, ex2, ey2, 0, 80, 180, 1);

  fillCircle(cx, cy, 7, 210, 30, 30);
  fillCircle(cx, cy, 4, 255, 80, 80);

  return _encodePng(pix, W, H).toString("base64");
}

module.exports = { createCameraAnnotationPng, _encodePng };
