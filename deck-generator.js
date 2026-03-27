// deck-generator.js — Beautiful PDF proposal deck for Poligrid clients
// Uses jsPDF (loaded from CDN on demand). No extra image calls to OpenAI.

(function () {
  'use strict';

  // ─── Colour palette ─────────────────────────────────────────────────────────
  const C = {
    coverBg:   [10, 25, 20],
    teal:      [58, 106, 90],
    gold:      [184, 109, 53],
    goldPale:  [220, 175, 120],
    dark:      [26, 31, 28],
    mid:       [80, 92, 86],
    dim:       [148, 160, 154],
    cream:     [243, 240, 234],
    offWhite:  [250, 248, 244],
    white:     [255, 255, 255],
    border:    [218, 213, 205],
    coverText: [200, 214, 208],
    coverDim:  [128, 148, 140],
  };

  // ─── A4 layout constants ────────────────────────────────────────────────────
  const PW = 210, PH = 297;
  const ML = 16, MR = 16, MB = 12;
  const IW = PW - ML - MR;

  // ─── BOQ category colours ───────────────────────────────────────────────────
  const CAT_COLORS = {
    'Civil work':         [120, 100, 75],
    'Plumbing':           [32, 128, 190],
    'Electrical':         [195, 155, 28],
    'Faux ceiling':       [95, 125, 155],
    'Flooring':           [140, 90, 58],
    'Doors and windows':  [75, 110, 78],
    'Painting':           [175, 78, 78],
    'Modular furniture':  [58, 106, 90],
    'Loose furniture':    [125, 88, 155],
  };
  function catCol(cat) { return CAT_COLORS[cat] || C.teal; }

  // Room-dot colours duplicated here so the module is self-contained
  const ROOM_DOT_COLORS = {
    bedroom: '#8a4db5', living: '#2e8b57', kitchen: '#c97820',
    bathroom: '#2080c0', dining: '#c04040', study: '#3070a0',
    balcony: '#288070', foyer: '#a09020', utility: '#707070',
    office: '#4060c0', conference: '#c06040', workstation: '#60c040',
    reception: '#c040c0', pantry: '#d0a020', store: '#808080',
    retail: '#d05070', other: '#6050a0',
  };

  // ─── Utilities ───────────────────────────────────────────────────────────────

  function hexToRgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }

  function fmtInr(n) {
    return '₹' + (parseFloat(n) || 0).toLocaleString('en-IN');
  }

  // Load any URL (or existing data-URL) into a JPEG data-URL via canvas.
  async function toDataUrl(src) {
    if (!src) return null;
    if (src.startsWith('data:')) return src;
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || img.width;
          c.height = img.naturalHeight || img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve(c.toDataURL('image/jpeg', 0.88));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Cover-crop a data-URL to an exact pixel target.
  async function coverCrop(dataUrl, tw, th) {
    if (!dataUrl) return null;
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = tw; c.height = th;
        const ctx = c.getContext('2d');
        const s = Math.max(tw / img.width, th / img.height);
        const dx = (tw - img.width * s) / 2;
        const dy = (th - img.height * s) / 2;
        ctx.drawImage(img, dx, dy, img.width * s, img.height * s);
        resolve(c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  async function imgDims(dataUrl) {
    if (!dataUrl) return { w: 1, h: 1 };
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
  }

  // Composite floor plan + room editor + planner canvases into one JPEG.
  function captureFloorPlan() {
    const bg = document.getElementById('floorBgCanvas');
    const re = document.getElementById('roomEditorCanvas');
    const pl = document.getElementById('plannerCanvas');
    if (!bg || bg.width === 0) return null;
    const c = document.createElement('canvas');
    c.width = bg.width; c.height = bg.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(bg, 0, 0);
    if (re && !re.hidden && re.width > 0) ctx.drawImage(re, 0, 0);
    if (pl && !pl.hidden && pl.width > 0) ctx.drawImage(pl, 0, 0);
    return c.toDataURL('image/jpeg', 0.92);
  }

  // ─── OpenAI narrative (single small text call) ───────────────────────────────
  async function fetchNarrative(projectName, brief, rooms, context) {
    const roomList = (rooms || []).slice(0, 8)
      .map(r => `${r.label || r.name}${r.widthM ? ` (${parseFloat(r.widthM).toFixed(1)}×${parseFloat(r.lengthM).toFixed(1)}m)` : ''}`)
      .join(', ');

    const prompt = `You are writing copy for a luxury interior design proposal PDF produced by an Indian interior design firm.

Project: ${projectName || 'Residential Interior'}
Type: ${context?.propertyType || 'Apartment'} ${context?.bhk || ''}
Carpet area: ${context?.totalAreaM2 || '?'} m²
Rooms: ${roomList || 'Multiple rooms'}
Design brief: ${brief || 'Modern Indian interior with warm tones and comfortable living'}

Write the following in an elegant, warm, first-person tone — directly for the client:
1. "intro": A 2-sentence project introduction capturing the design vision (max 55 words, aspirational yet grounded)
2. "highlights": Exactly 4 concise design highlight phrases (3–6 words each), e.g. "Warm walnut modular cabinetry", "Layered ambient lighting design"
3. "closing": One elegant closing sentence for the client (max 22 words)

Respond ONLY with valid JSON (no markdown fences): {"intro":"...","highlights":["...","...","...","..."],"closing":"..."}`;

    try {
      const res = await fetch('/api/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 380 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const match = (data.text || '').match(/\{[\s\S]*\}/);
      if (match) {
        const p = JSON.parse(match[0]);
        if (p.intro && Array.isArray(p.highlights) && p.closing) return p;
      }
    } catch (e) {
      console.warn('[Deck] Narrative fetch failed:', e.message);
    }
    // Fallback
    return {
      intro: 'A thoughtfully designed home crafted around your lifestyle, where considered materials and layered light create a space that feels personal and enduring.',
      highlights: ['Warm modular cabinetry', 'Layered ambient lighting', 'Curated material palette', 'Space-optimised layouts'],
      closing: 'Every corner of your new home has been designed to feel intentional, inviting, and timeless.',
    };
  }

  // ─── PDF drawing helpers ─────────────────────────────────────────────────────

  function pageHeader(doc, title, subtitle) {
    doc.setFillColor(...C.teal);
    doc.rect(0, 0, PW, 2, 'F');
    doc.setFillColor(...C.gold);
    doc.rect(0, 0, 5, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...C.dark);
    doc.text(title, ML, 13);

    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.mid);
      doc.text(subtitle, ML, 19);
    }

    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.line(ML, subtitle ? 23 : 17, PW - MR, subtitle ? 23 : 17);
  }

  function pageFooter(doc, pg, total, projectName) {
    const y = PH - 7;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.line(ML, y - 2, PW - MR, y - 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.dim);
    doc.text((projectName || 'Interior Design Proposal').slice(0, 50), ML, y + 1);
    doc.text(`${pg} / ${total}`, PW - MR, y + 1, { align: 'right' });
  }

  // Returns next Y after block
  function textBlock(doc, text, x, y, maxW, lineH) {
    if (!text) return y;
    const lines = doc.splitTextToSize(text, maxW);
    lines.forEach((l, i) => doc.text(l, x, y + i * lineH));
    return y + lines.length * lineH;
  }

  // Place an image cover-cropped to fill the box exactly
  async function placeImg(doc, dataUrl, x, y, w, h) {
    if (!dataUrl) return;
    const px = Math.round(w * 7);
    const py = Math.round(h * 7);
    const cropped = await coverCrop(dataUrl, px, py);
    if (cropped) doc.addImage(cropped, 'JPEG', x, y, w, h, undefined, 'MEDIUM');
  }

  // ─── Main generator exposed on window ────────────────────────────────────────

  window.DeckGenerator = {

    async generate({ appState, allVersions, activeCameraPins, projectBoqItems, projectName }) {

      // ── Load jsPDF on demand ───────────────────────────────────────────────
      if (!window.jspdf) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const { jsPDF } = window.jspdf;

      // ── Progress indicator ─────────────────────────────────────────────────
      const setStatus = msg => {
        const el = document.getElementById('deckProgressMsg');
        if (el) el.textContent = msg;
        const btn = document.getElementById('downloadDeckBtn');
        if (btn) btn.disabled = !!msg;
      };

      // ── Gather data ────────────────────────────────────────────────────────
      const latestVer    = allVersions[allVersions.length - 1] || {};
      const renders      = latestVer.renders || [];
      const boqItems     = [...(projectBoqItems || []), ...(latestVer.boqItems || [])];
      const rooms        = appState.confirmedRooms || appState.detectedRooms || [];
      const context      = appState.context || {};
      const brief        = latestVer.design_brief || '';
      const versionNum   = latestVer.version_number || 1;
      const vDate        = latestVer.created_at
        ? new Date(latestVer.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const inspUrls     = latestVer.inspirationUrls || appState.storedInspirationUrls || [];

      // ── Load images ────────────────────────────────────────────────────────
      setStatus('Loading inspiration images…');
      const inspData = (await Promise.all(inspUrls.slice(0, 6).map(toDataUrl))).filter(Boolean);

      setStatus('Loading renders…');
      const rendersLoaded = await Promise.all(renders.map(async r => ({
        ...r, imgData: await toDataUrl(r.url),
      })));

      setStatus('Loading reference photos…');
      const pinsLoaded = await Promise.all(activeCameraPins.map(async p => ({
        ...p, refData: p.photo_url ? await toDataUrl(p.photo_url) : null,
      })));

      setStatus('Capturing floor plan…');
      const floorData = captureFloorPlan();

      setStatus('Generating design narrative…');
      const narrative = await fetchNarrative(projectName, brief, rooms, context);

      // ── Group renders by room ──────────────────────────────────────────────
      const roomMap = {};
      for (const r of rendersLoaded) {
        const k = r.room_label || 'Unknown Room';
        if (!roomMap[k]) roomMap[k] = [];
        roomMap[k].push(r);
      }

      // ── Estimate total pages ───────────────────────────────────────────────
      const catEntries = Object.entries(
        boqItems.reduce((acc, it) => {
          const cat = it.category || 'Other';
          acc[cat] = (acc[cat] || 0) + (parseFloat(it.amount) || 0);
          return acc;
        }, {})
      );

      let totalPages =
        1 +                                  // cover
        1 +                                  // design vision
        Object.keys(roomMap).length +        // one render page per room (approx)
        (inspData.length ? 1 : 0) +          // moodboard
        (boqItems.length ? 1 : 0) +          // BOQ summary
        catEntries.length +                  // BOQ detail (1 per category)
        (floorData ? 1 : 0);                 // floor plan

      let pg = 0;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      function np() { pg++; if (pg > 1) doc.addPage(); }

      // ══════════════════════════════════════════════════════════════════════
      // PAGE 1 — COVER
      // ══════════════════════════════════════════════════════════════════════
      setStatus('Building PDF…');
      np();

      doc.setFillColor(...C.coverBg);
      doc.rect(0, 0, PW, PH, 'F');

      // Accent bars
      doc.setFillColor(...C.gold);
      doc.rect(0, 0, PW, 1.8, 'F');
      doc.setFillColor(...C.teal);
      doc.rect(0, 0, 2, PH, 'F');

      // Brand block
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...C.goldPale);
      doc.text('POLIGRID', ML + 6, 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.coverDim);
      doc.text('Interior Fitout Planner', ML + 6, 19);
      doc.setDrawColor(...C.teal);
      doc.setLineWidth(0.4);
      doc.line(ML + 6, 22, ML + 42, 22);

      // Proposal label
      const labelY = 82;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.goldPale);
      doc.text('INTERIOR  DESIGN  PROPOSAL', PW / 2, labelY, { align: 'center' });

      // Project name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(33);
      doc.setTextColor(...C.white);
      const pLines = doc.splitTextToSize(projectName || 'Your Home', 172);
      pLines.slice(0, 2).forEach((l, i) => doc.text(l, PW / 2, labelY + 14 + i * 14, { align: 'center' }));
      const afterName = labelY + 14 + Math.min(pLines.length, 2) * 14;

      // Gold rule
      doc.setDrawColor(...C.gold);
      doc.setLineWidth(0.9);
      doc.line(PW / 2 - 24, afterName + 5, PW / 2 + 24, afterName + 5);

      // Property details line
      const detParts = [
        context.propertyType,
        context.bhk,
        context.totalAreaM2 ? `${context.totalAreaM2} m²` : null,
        rooms.length ? `${rooms.length} Rooms` : null,
      ].filter(Boolean);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...C.coverText);
      doc.text(detParts.join('  ·  '), PW / 2, afterName + 16, { align: 'center' });

      // Brief excerpt
      if (brief) {
        const bLines = doc.splitTextToSize(`"${brief}"`, 145);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(172, 196, 186);
        bLines.slice(0, 3).forEach((l, i) => doc.text(l, PW / 2, afterName + 30 + i * 5.5, { align: 'center' }));
      }

      // Inspiration strip at bottom
      if (inspData.length > 0) {
        const stripY = PH - 58;
        const stripH = 34;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...C.coverDim);
        doc.text('STYLE  REFERENCES', ML + 6, stripY - 5);
        doc.setDrawColor(...C.gold);
        doc.setLineWidth(0.2);
        doc.line(ML + 6, stripY - 3, PW - MR - 6, stripY - 3);

        const imgs = inspData.slice(0, 4);
        const iGap = 3;
        const iW = (IW - 12 - (imgs.length - 1) * iGap) / imgs.length;
        for (let i = 0; i < imgs.length; i++) {
          const ix = ML + 6 + i * (iW + iGap);
          await placeImg(doc, imgs[i], ix, stripY, iW, stripH);
          doc.setDrawColor(...C.teal);
          doc.setLineWidth(0.4);
          doc.rect(ix, stripY, iW, stripH);
        }
      }

      // Bottom metadata
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.coverDim);
      doc.text(vDate, ML + 6, PH - 8);
      doc.text(`Version ${versionNum}`, PW - MR - 6, PH - 8, { align: 'right' });

      // ══════════════════════════════════════════════════════════════════════
      // PAGE 2 — DESIGN VISION
      // ══════════════════════════════════════════════════════════════════════
      np();
      doc.setFillColor(...C.offWhite);
      doc.rect(0, 0, PW, PH, 'F');
      pageHeader(doc, 'Design Vision', 'Our approach to your home');
      pageFooter(doc, pg, totalPages, projectName);

      const visY = 29;
      const leftW  = IW * 0.52;
      const rightX = ML + leftW + 6;
      const rightW = IW - leftW - 6;

      // — Left column: narrative —
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...C.teal);
      doc.text('The Concept', ML, visY + 2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.dark);
      let ly = textBlock(doc, narrative.intro, ML, visY + 10, leftW, 5.2);

      // Highlights
      ly += 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...C.dark);
      doc.text('Design Highlights', ML, ly);
      ly += 9;

      narrative.highlights.forEach((hl) => {
        doc.setFillColor(...C.cream);
        doc.roundedRect(ML, ly - 5.5, leftW, 9, 2, 2, 'F');
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.2);
        doc.roundedRect(ML, ly - 5.5, leftW, 9, 2, 2, 'S');
        doc.setFillColor(...C.teal);
        doc.circle(ML + 5, ly - 1, 1.8, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...C.dark);
        doc.text(hl, ML + 11, ly);
        ly += 11;
      });

      // Closing quote
      ly += 6;
      const closingLines = doc.splitTextToSize(narrative.closing, leftW - 8);
      doc.setFillColor(...C.gold);
      doc.rect(ML, ly - 6, 2.5, closingLines.length * 5.5 + 5, 'F');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...C.gold);
      closingLines.forEach((l, i) => doc.text(l, ML + 7, ly + i * 5.5));

      // — Right column: inspiration grid —
      if (inspData.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(...C.teal);
        doc.text('Style References', rightX, visY + 2);

        const gridImgs = inspData.slice(0, 4);
        const cols = 2, gGap = 3;
        const gW = (rightW - gGap) / cols;
        const gH = gW * 0.72;

        for (let gi = 0; gi < gridImgs.length; gi++) {
          const gc = gi % cols, gr = Math.floor(gi / cols);
          const gx = rightX + gc * (gW + gGap);
          const gy = visY + 10 + gr * (gH + gGap);
          await placeImg(doc, gridImgs[gi], gx, gy, gW, gH);
          doc.setDrawColor(...C.border);
          doc.setLineWidth(0.25);
          doc.rect(gx, gy, gW, gH);
        }
      }

      // — Room summary strip at bottom —
      if (rooms.length > 0) {
        const sY = PH - MB - 40;
        doc.setFillColor(...C.cream);
        doc.roundedRect(ML, sY, IW, 32, 2, 2, 'F');
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.25);
        doc.roundedRect(ML, sY, IW, 32, 2, 2, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.teal);
        doc.text('SPACE SUMMARY', ML + 5, sY + 7);

        const dispRooms = rooms.slice(0, 6);
        const rCW = IW / dispRooms.length;
        dispRooms.forEach((room, i) => {
          const rx = ML + i * rCW;
          if (i > 0) {
            doc.setDrawColor(...C.border);
            doc.setLineWidth(0.15);
            doc.line(rx, sY + 4, rx, sY + 30);
          }
          const rc = hexToRgb(ROOM_DOT_COLORS[room.roomType || room.type] || '#6050a0');
          doc.setFillColor(...rc);
          doc.circle(rx + 5, sY + 17, 2, 'F');

          const rname = (room.label || room.name || 'Room');
          const rNameLines = doc.splitTextToSize(rname, rCW - 12);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(...C.dark);
          rNameLines.slice(0, 2).forEach((nl, ni) => {
            doc.text(nl, rx + 10, sY + 15 + ni * 5);
          });

          if (room.widthM && room.lengthM) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...C.dim);
            doc.text(`${parseFloat(room.widthM).toFixed(1)}×${parseFloat(room.lengthM).toFixed(1)}m`, rx + 10, sY + 26);
          }
        });
      }

      // ══════════════════════════════════════════════════════════════════════
      // PAGES 3+ — ROOM RENDERS
      // ══════════════════════════════════════════════════════════════════════
      for (const [roomLabel, roomRenders] of Object.entries(roomMap)) {
        const room = rooms.find(r => r.label === roomLabel || r.name === roomLabel);

        for (let ri = 0; ri < roomRenders.length; ri++) {
          const render = roomRenders[ri];
          np();

          doc.setFillColor(...C.offWhite);
          doc.rect(0, 0, PW, PH, 'F');

          const sub = [
            room ? `${parseFloat(room.widthM || 0).toFixed(1)} × ${parseFloat(room.lengthM || 0).toFixed(1)} m` : null,
            room?.roomType ? room.roomType.replace('_', ' ') : null,
            roomRenders.length > 1 ? `View ${ri + 1} of ${roomRenders.length}` : null,
          ].filter(Boolean).join('  ·  ');

          pageHeader(doc, roomLabel, sub);
          pageFooter(doc, pg, totalPages, projectName);

          const pin = pinsLoaded.find(p => p.client_id === render.camera_pin_client_id);
          const refImg = pin?.refData || null;

          const cmpTop = 29;
          const cellW = (IW - 5) / 2;
          const cellH = Math.min(cellW * 0.68, 88);

          // Column labels
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(...C.mid);
          doc.text('BEFORE  (Reference)', ML, cmpTop - 1.5);
          doc.text('AFTER  (Furnished Render)', ML + cellW + 5, cmpTop - 1.5);

          // Before image
          if (refImg) {
            await placeImg(doc, refImg, ML, cmpTop, cellW, cellH);
          } else {
            doc.setFillColor(...C.cream);
            doc.rect(ML, cmpTop, cellW, cellH, 'F');
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(...C.dim);
            doc.text('No reference photo', ML + cellW / 2, cmpTop + cellH / 2, { align: 'center' });
          }

          // After image
          if (render.imgData) {
            await placeImg(doc, render.imgData, ML + cellW + 5, cmpTop, cellW, cellH);
          } else {
            doc.setFillColor(...C.cream);
            doc.rect(ML + cellW + 5, cmpTop, cellW, cellH, 'F');
          }

          // Borders
          doc.setDrawColor(...C.border);
          doc.setLineWidth(0.3);
          doc.rect(ML, cmpTop, cellW, cellH);
          doc.rect(ML + cellW + 5, cmpTop, cellW, cellH);

          // Arrow connector
          const arrowMidY = cmpTop + cellH / 2;
          const arrowX = ML + cellW + 2.5;
          doc.setFillColor(...C.teal);
          doc.circle(arrowX, arrowMidY, 3, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(...C.white);
          doc.text('›', arrowX, arrowMidY + 1.2, { align: 'center' });

          // ── Info section ─────────────────────────────────────────────────
          let infoY = cmpTop + cellH + 10;

          // Pin brief
          const pinBrief = pin?.brief || '';
          if (pinBrief) {
            const bLines = doc.splitTextToSize(`"${pinBrief}"`, IW - 10);
            const barH = bLines.length * 5.2 + 6;
            doc.setFillColor(...C.teal);
            doc.rect(ML, infoY - 4, 2.5, barH, 'F');
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...C.dark);
            infoY = textBlock(doc, `"${pinBrief}"`, ML + 7, infoY, IW - 10, 5.2) + 7;
          }

          // Camera angle/FOV badges
          if (pin) {
            const badges = [
              pin.angle_deg != null ? `${pin.angle_deg}° Direction` : null,
              pin.fov_deg ? `${pin.fov_deg}° FOV` : null,
            ].filter(Boolean);
            let bx = ML;
            badges.forEach(badge => {
              const bw = doc.getTextWidth(badge) + 10;
              doc.setFillColor(...C.cream);
              doc.roundedRect(bx, infoY - 4, bw, 7.5, 1.5, 1.5, 'F');
              doc.setDrawColor(...C.border);
              doc.setLineWidth(0.2);
              doc.roundedRect(bx, infoY - 4, bw, 7.5, 1.5, 1.5, 'S');
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7.5);
              doc.setTextColor(...C.mid);
              doc.text(badge, bx + 5, infoY + 0.5);
              bx += bw + 5;
            });
            infoY += 14;
          }

          // Furniture list
          let furList = [];
          try {
            if (render.furniture_list) {
              furList = typeof render.furniture_list === 'string'
                ? JSON.parse(render.furniture_list)
                : render.furniture_list;
            }
          } catch {}

          if (furList.length > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...C.teal);
            doc.text('Key Furniture Pieces', ML, infoY);
            infoY += 7;

            const fItems = furList.slice(0, 9);
            const fCols = 3;
            const fCW = IW / fCols;
            fItems.forEach((item, fi) => {
              const fc = fi % fCols, fr = Math.floor(fi / fCols);
              const fx = ML + fc * fCW;
              const fy = infoY + fr * 8;
              if (fy > PH - MB - 12) return;
              doc.setFillColor(...C.gold);
              doc.circle(fx + 2, fy - 1.5, 1.2, 'F');
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(8);
              doc.setTextColor(...C.dark);
              const fname = typeof item === 'string' ? item : (item.label || item.name || item.item || '');
              doc.text(fname.slice(0, 30), fx + 6, fy, { maxWidth: fCW - 8 });
            });
          }
        }
      }

      // ══════════════════════════════════════════════════════════════════════
      // INSPIRATION MOODBOARD
      // ══════════════════════════════════════════════════════════════════════
      if (inspData.length > 0) {
        np();
        doc.setFillColor(...C.offWhite);
        doc.rect(0, 0, PW, PH, 'F');
        pageHeader(doc, 'Style Inspiration', 'The visual references that shaped your design direction');
        pageFooter(doc, pg, totalPages, projectName);

        const mTop = 29;
        const mCols = inspData.length <= 2 ? 2 : inspData.length <= 4 ? 2 : 3;
        const mGap  = 4;
        const mW    = (IW - (mCols - 1) * mGap) / mCols;
        const mH    = mW * 0.68;
        const mRows = Math.ceil(inspData.length / mCols);
        const avH   = PH - mTop - MB - 18;
        const finH  = Math.min(mH, (avH - (mRows - 1) * mGap) / mRows);

        for (let mi = 0; mi < inspData.length; mi++) {
          const mc = mi % mCols, mr = Math.floor(mi / mCols);
          const mx = ML + mc * (mW + mGap);
          const my = mTop + mr * (finH + mGap);
          await placeImg(doc, inspData[mi], mx, my, mW, finH);
          doc.setDrawColor(...C.border);
          doc.setLineWidth(0.25);
          doc.rect(mx, my, mW, finH);
        }

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.dim);
        doc.text('These images were shared as client style references and guided the overall design direction.', ML, PH - MB - 10);
      }

      // ══════════════════════════════════════════════════════════════════════
      // BOQ SUMMARY PAGE
      // ══════════════════════════════════════════════════════════════════════
      if (boqItems.length > 0) {
        np();
        doc.setFillColor(...C.offWhite);
        doc.rect(0, 0, PW, PH, 'F');
        pageHeader(doc, 'Investment Overview', 'Bill of Quantities  ·  Hyderabad Premium Market Rates');
        pageFooter(doc, pg, totalPages, projectName);

        // Compute totals
        let grandTotal = 0;
        const catTotals = {}, catItemCount = {};
        for (const item of boqItems) {
          const cat = item.category || 'Other';
          const amt = parseFloat(item.amount) || 0;
          catTotals[cat]     = (catTotals[cat] || 0) + amt;
          catItemCount[cat]  = (catItemCount[cat] || 0) + 1;
          grandTotal += amt;
        }
        const cats = Object.entries(catTotals);

        // Hero total box
        const heroY = 29;
        doc.setFillColor(...C.teal);
        doc.roundedRect(ML, heroY, IW, 20, 3, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text('TOTAL ESTIMATED INVESTMENT', ML + 6, heroY + 7.5);
        doc.setFontSize(18);
        doc.text(fmtInr(grandTotal), ML + 6, heroY + 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 198, 178);
        doc.text(`${boqItems.length} items  ·  ${cats.length} categories`, PW - MR - 6, heroY + 7.5, { align: 'right' });
        doc.text('Hyderabad premium market rates', PW - MR - 6, heroY + 16, { align: 'right' });

        // Stacked bar
        const barY = heroY + 25;
        const barH = 10;
        let bx = ML;
        cats.forEach(([cat, total]) => {
          const sw = (total / grandTotal) * IW;
          doc.setFillColor(...catCol(cat));
          doc.rect(bx, barY, sw, barH, 'F');
          bx += sw;
        });
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.3);
        doc.rect(ML, barY, IW, barH);

        // Category table
        const tRH = 10;
        const tY0 = barY + barH + 8;
        const tCW = [IW * 0.50, IW * 0.17, IW * 0.14, IW * 0.19];
        const tCX = tCW.reduce((acc, w, i) => { acc.push(i === 0 ? ML : acc[i - 1] + tCW[i - 1]); return acc; }, []);

        doc.setFillColor(...C.dark);
        doc.rect(ML, tY0, IW, tRH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        ['Category', 'Items', 'Share', 'Amount'].forEach((h, i) => doc.text(h, tCX[i] + 3, tY0 + 6.5));

        let tY = tY0 + tRH;
        cats.forEach(([cat, total], i) => {
          doc.setFillColor(i % 2 === 0 ? 255 : 249, i % 2 === 0 ? 255 : 249, i % 2 === 0 ? 255 : 249);
          doc.rect(ML, tY, IW, tRH, 'F');

          const pct = ((total / grandTotal) * 100).toFixed(0);
          doc.setFillColor(...catCol(cat));
          doc.roundedRect(tCX[0] + 3, tY + 3, 4, 4, 0.5, 0.5, 'F');

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(...C.dark);
          doc.text(cat, tCX[0] + 10, tY + 6.5);
          doc.text(`${catItemCount[cat] || 0}`, tCX[1] + 3, tY + 6.5);
          doc.text(`${pct}%`, tCX[2] + 3, tY + 6.5);
          doc.setFont('helvetica', 'bold');
          doc.text(fmtInr(total), tCX[3] + 3, tY + 6.5);

          doc.setDrawColor(...C.border);
          doc.setLineWidth(0.1);
          doc.line(ML, tY + tRH, ML + IW, tY + tRH);
          tY += tRH;
        });

        // Grand total row
        doc.setFillColor(...C.teal);
        doc.rect(ML, tY, IW, tRH + 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text('Grand Total', tCX[0] + 3, tY + 7.5);
        doc.text(fmtInr(grandTotal), tCX[3] + 3, tY + 7.5);

        // Legend
        let legX = ML, legY = tY + tRH + 14;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.teal);
        doc.text('COST BREAKDOWN', ML, legY - 5);
        legY += 2;

        cats.forEach(([cat, total]) => {
          const pct = ((total / grandTotal) * 100).toFixed(0);
          const legW = 43;
          if (legX + legW > PW - MR) { legX = ML; legY += 9; }
          doc.setFillColor(...catCol(cat));
          doc.rect(legX, legY - 3.5, 5, 3.5, 'F');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(...C.dark);
          doc.text(`${cat.slice(0, 14)} (${pct}%)`, legX + 7, legY);
          legX += legW;
        });

        // Disclaimer
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(...C.dim);
        doc.text(
          '* All rates are indicative and based on Hyderabad premium market pricing (2024-25). Final costs may vary with material selection, site conditions, and contractor quotes.',
          ML, PH - MB - 12, { maxWidth: IW }
        );

        // ── BOQ DETAIL — one page per category ────────────────────────────
        const boqByCat = {};
        for (const item of boqItems) {
          const cat = item.category || 'Other';
          if (!boqByCat[cat]) boqByCat[cat] = [];
          boqByCat[cat].push(item);
        }

        for (const [cat, items] of Object.entries(boqByCat)) {
          const cc = catCol(cat);
          const catTotal = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);

          np();
          doc.setFillColor(...C.offWhite);
          doc.rect(0, 0, PW, PH, 'F');
          doc.setFillColor(...cc);
          doc.rect(0, 0, PW, 2, 'F');
          pageHeader(doc, cat, 'Bill of Quantities — Detail');
          pageFooter(doc, pg, totalPages, projectName);

          // Category total chip (top-right)
          const chipTxt = fmtInr(catTotal);
          const chipW   = doc.getTextWidth(chipTxt) + 16;
          doc.setFillColor(...cc);
          doc.roundedRect(PW - MR - chipW, 7, chipW, 9, 2, 2, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(255, 255, 255);
          doc.text(chipTxt, PW - MR - chipW / 2, 13, { align: 'center' });

          const dRH = 8;
          const dCW = [IW * 0.42, IW * 0.12, IW * 0.10, IW * 0.16, IW * 0.20];
          const dCX = dCW.reduce((acc, w, i) => { acc.push(i === 0 ? ML : acc[i - 1] + dCW[i - 1]); return acc; }, []);
          let dy = 29;

          const drawTableHeader = () => {
            doc.setFillColor(...cc);
            doc.rect(ML, dy, IW, dRH + 1, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(255, 255, 255);
            ['Item Description', 'Qty', 'Unit', 'Rate (₹)', 'Amount (₹)'].forEach((h, i) => {
              doc.text(h, dCX[i] + 2, dy + 5.5);
            });
            dy += dRH + 1;
          };
          drawTableHeader();

          items.forEach((item, ii) => {
            if (dy > PH - MB - 22) {
              // Subtotal placeholder row, then new page
              np();
              doc.setFillColor(...C.offWhite);
              doc.rect(0, 0, PW, PH, 'F');
              doc.setFillColor(...cc);
              doc.rect(0, 0, PW, 2, 'F');
              pageHeader(doc, `${cat} (continued)`, 'Bill of Quantities — Detail');
              pageFooter(doc, pg, totalPages, projectName);
              dy = 29;
              drawTableHeader();
            }

            const amt = parseFloat(item.amount) || 0;
            doc.setFillColor(ii % 2 === 0 ? 255 : 249, ii % 2 === 0 ? 255 : 249, ii % 2 === 0 ? 255 : 249);
            doc.rect(ML, dy, IW, dRH, 'F');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...C.dark);

            const vals = [
              item.item || '',
              parseFloat(item.qty || 0).toFixed(item.unit === 'pcs' ? 0 : 1),
              item.unit || '',
              fmtInr(item.rate || 0),
              fmtInr(amt),
            ];
            vals.forEach((v, j) => doc.text(String(v), dCX[j] + 2, dy + 5.5, { maxWidth: dCW[j] - 4 }));

            doc.setDrawColor(...C.border);
            doc.setLineWidth(0.1);
            doc.line(ML, dy + dRH, ML + IW, dy + dRH);
            dy += dRH;
          });

          // Subtotal row
          doc.setFillColor(...cc);
          doc.rect(ML, dy, IW, dRH + 1, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(255, 255, 255);
          doc.text(`${cat} Total`, dCX[0] + 2, dy + 6.5);
          doc.text(fmtInr(catTotal), dCX[4] + 2, dy + 6.5);
        }
      }

      // ══════════════════════════════════════════════════════════════════════
      // FLOOR PLAN PAGE
      // ══════════════════════════════════════════════════════════════════════
      if (floorData) {
        np();
        doc.setFillColor(...C.offWhite);
        doc.rect(0, 0, PW, PH, 'F');
        pageHeader(doc, 'Space Layout', 'Floor plan with room designations and camera viewpoints');
        pageFooter(doc, pg, totalPages, projectName);

        const fpTop   = 29;
        const fpAvailH = PH - fpTop - MB - 58;
        const fpAvailW = IW;

        const dims = await imgDims(floorData);
        const aspect = dims.w / dims.h;
        let fpW = fpAvailW, fpH = fpW / aspect;
        if (fpH > fpAvailH) { fpH = fpAvailH; fpW = fpH * aspect; }
        const fpX = ML + (fpAvailW - fpW) / 2;

        doc.addImage(floorData, 'JPEG', fpX, fpTop, fpW, fpH, undefined, 'MEDIUM');
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.3);
        doc.rect(fpX, fpTop, fpW, fpH);

        // Room legend
        const legY = fpTop + fpH + 8;
        if (rooms.length > 0) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(...C.teal);
          doc.text('ROOMS', ML, legY + 4);

          const lCols = 3, lCW = IW / lCols;
          rooms.forEach((room, i) => {
            const lc = i % lCols, lr = Math.floor(i / lCols);
            const lx = ML + lc * lCW;
            const ly = legY + 12 + lr * 9;
            if (ly > PH - MB - 18) return;
            const rc = hexToRgb(ROOM_DOT_COLORS[room.roomType || room.type] || '#6050a0');
            doc.setFillColor(...rc);
            doc.circle(lx + 2.5, ly - 1.5, 2, 'F');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...C.dark);
            const dimStr = room.widthM && room.lengthM
              ? ` · ${parseFloat(room.widthM).toFixed(1)}×${parseFloat(room.lengthM).toFixed(1)}m` : '';
            doc.text(`${room.label || room.name}${dimStr}`, lx + 7, ly, { maxWidth: lCW - 10 });
          });
        }

        // Camera pin legend
        const pinLegY = legY + 12 + Math.ceil(rooms.length / 3) * 9 + 4;
        if (activeCameraPins.length > 0 && pinLegY < PH - MB - 15) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(...C.gold);
          doc.text('CAMERA VIEWPOINTS', ML, pinLegY + 4);

          activeCameraPins.forEach((pin, i) => {
            const py = pinLegY + 12 + i * 8;
            if (py > PH - MB - 8) return;
            doc.setFillColor(...C.gold);
            doc.circle(ML + 2.5, py - 1.5, 2, 'F');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...C.dark);
            const pInfo = `${pin.room_label || 'Room'} · ${pin.angle_deg ?? '—'}° direction · ${pin.fov_deg ?? 60}° FOV`;
            doc.text(pInfo, ML + 7, py);
          });
        }
      }

      // ── Save ───────────────────────────────────────────────────────────────
      const safeName = (projectName || 'Interior-Design-Proposal')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 50);
      doc.save(`${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
      setStatus('');
    },
  };

})();
