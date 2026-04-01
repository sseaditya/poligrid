// ─── Floor plan rendering to canvas ─────────────────────────────────────────

async function renderFloorPlanToCanvas(file, targetCanvas) {
  if (!targetCanvas) return;
  if (file.type === "application/pdf") {
    await renderPdfFirstPage(file, targetCanvas);
  } else if (file.type.startsWith("image/")) {
    await renderImageToCanvas(file, targetCanvas);
  }
}

async function renderImageToCanvas(file, canvas) {
  const img = await readImage(file);
  const maxW = 960;
  const scale = img.width > maxW ? maxW / img.width : 1;
  canvas.width = Math.max(2, Math.round(img.width * scale));
  canvas.height = Math.max(2, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

async function renderPdfFirstPage(file, canvas) {
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) throw new Error("PDF renderer not available.");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const maxW = 960;
  const unscaled = page.getViewport({ scale: 1 });
  const scale = unscaled.width > maxW ? maxW / unscaled.width : 1.25;
  const viewport = page.getViewport({ scale });
  canvas.width = Math.max(2, Math.round(viewport.width));
  canvas.height = Math.max(2, Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
}

