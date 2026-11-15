"use strict";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#preview-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const MAX_OUTPUT_PIXELS = 25_000_000;
const paperSizes = {
  A4: [21, 29.7],
  A3: [29.7, 42],
  A2: [42, 59.4],
  A1: [59.4, 84.1],
  A0: [84.1, 118.9],
};

const state = {
  image: null,
  fileName: "printscale",
  rotation: 0,
  grayscale: false,
  sepia: false,
  zoom: 1,
  qr: null,
  toastTimer: 0,
};

const cropIds = ["crop-left", "crop-right", "crop-top", "crop-bottom"];
const filters = ["brightness", "contrast", "saturation", "blur"];
const allLiveControls = [
  "#paper-preset", "#print-width", "#print-height", "#print-dpi",
  "#brightness", "#contrast", "#saturation", "#blur", "#overlay-text",
  "#text-color", "#text-size", "#frame-toggle", "#frame-color",
  "#grayscale-toggle", "#sepia-toggle", ...cropIds.map((id) => `#${id}`),
];

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function getPrintSize() {
  return {
    width: Number($("#print-width").value),
    height: Number($("#print-height").value),
    dpi: Number($("#print-dpi").value),
  };
}

function getOutputDimensions() {
  const { width, height, dpi } = getPrintSize();
  const scale = dpi / 2.54;
  let pixelWidth = Math.round(width * scale);
  let pixelHeight = Math.round(height * scale);
  const pixelCount = pixelWidth * pixelHeight;
  if (pixelCount > MAX_OUTPUT_PIXELS) {
    const reduction = Math.sqrt(MAX_OUTPUT_PIXELS / pixelCount);
    pixelWidth = Math.floor(pixelWidth * reduction);
    pixelHeight = Math.floor(pixelHeight * reduction);
  }
  const actualDpi = Math.round(Math.min(pixelWidth / (width / 2.54), pixelHeight / (height / 2.54)));
  return { width: pixelWidth, height: pixelHeight, dpi: actualDpi, requestedDpi: dpi };
}

function getCrop() {
  const values = cropIds.map((id) => Math.min(45, Math.max(0, Number($(`#${id}`).value) || 0)));
  if (values[0] + values[1] >= 90) values[1] = Math.max(0, 89 - values[0]);
  if (values[2] + values[3] >= 90) values[3] = Math.max(0, 89 - values[2]);
  return { left: values[0] / 100, right: values[1] / 100, top: values[2] / 100, bottom: values[3] / 100 };
}

function getFilterString(width, height) {
  const brightness = Number($("#brightness").value);
  const contrast = Number($("#contrast").value);
  const saturation = Number($("#saturation").value);
  const blur = Number($("#blur").value) * Math.min(width, height) / 1000;
  return [
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${state.grayscale ? 0 : saturation}%)`,
    `grayscale(${state.grayscale ? 100 : 0}%)`,
    `sepia(${state.sepia ? 100 : 0}%)`,
    `blur(${blur}px)`,
  ].join(" ");
}

function drawArtwork(target, width, height) {
  const context = target.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);

  if (state.image) {
    const crop = getCrop();
    const sourceWidth = state.image.naturalWidth || state.image.width;
    const sourceHeight = state.image.naturalHeight || state.image.height;
    let sx = sourceWidth * crop.left;
    let sy = sourceHeight * crop.top;
    let sw = sourceWidth * (1 - crop.left - crop.right);
    let sh = sourceHeight * (1 - crop.top - crop.bottom);
    const turn = ((state.rotation % 360) + 360) % 360;
    const rotated = turn === 90 || turn === 270;
    const drawWidth = rotated ? height : width;
    const drawHeight = rotated ? width : height;
    const desiredRatio = drawWidth / drawHeight;
    if (sw / sh > desiredRatio) {
      const adjustedWidth = sh * desiredRatio;
      sx += (sw - adjustedWidth) / 2;
      sw = adjustedWidth;
    } else {
      const adjustedHeight = sw / desiredRatio;
      sy += (sh - adjustedHeight) / 2;
      sh = adjustedHeight;
    }

    context.save();
    context.translate(width / 2, height / 2);
    context.rotate((turn * Math.PI) / 180);
    context.filter = getFilterString(drawWidth, drawHeight);
    context.drawImage(state.image, sx, sy, sw, sh, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();

    if ($("#frame-toggle").checked) {
      context.save();
      context.strokeStyle = $("#frame-color").value;
      context.lineWidth = Math.max(2, Math.min(width, height) * 0.018);
      context.strokeRect(context.lineWidth / 2, context.lineWidth / 2, width - context.lineWidth, height - context.lineWidth);
      context.restore();
    }

    const text = $("#overlay-text").value.trim();
    if (text) {
      const sizeRatio = { small: 0.027, medium: 0.045, large: 0.065 }[$("#text-size").value] || 0.045;
      const fontSize = Math.max(10, Math.min(width, height) * sizeRatio);
      context.save();
      context.font = `600 ${fontSize}px "DM Sans", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.shadowColor = "rgba(0,0,0,.65)";
      context.shadowBlur = fontSize * 0.22;
      context.fillStyle = $("#text-color").value;
      context.fillText(text, width / 2, height * 0.9, width * 0.88);
      context.restore();
    }

    if (state.qr) drawQr(context, state.qr, width, height);
  } else {
    context.fillStyle = "#e9edf0";
    context.fillRect(0, 0, width, height);
  }
  return context;
}

function getPreviewDimensions() {
  const { width, height } = getOutputDimensions();
  const factor = Math.min(1400 / width, 1400 / height, 1);
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

function updateQuality() {
  const card = $("#quality-card");
  const message = $("#quality-message");
  card.className = "quality-card";
  if (!state.image) {
    card.classList.add("quality-empty");
    message.textContent = "Nahraj obrázok a skontroluj kvalitu tlače.";
    return;
  }
  const { width, height, dpi } = getPrintSize();
  const crop = getCrop();
  let sourceWidth = (state.image.naturalWidth || state.image.width) * (1 - crop.left - crop.right);
  let sourceHeight = (state.image.naturalHeight || state.image.height) * (1 - crop.top - crop.bottom);
  const rotated = Math.abs(state.rotation % 180) === 90;
  const targetWidth = rotated ? height : width;
  const targetHeight = rotated ? width : height;
  if (sourceWidth / sourceHeight > targetWidth / targetHeight) {
    sourceWidth = sourceHeight * targetWidth / targetHeight;
  } else {
    sourceHeight = sourceWidth * targetHeight / targetWidth;
  }
  const dpiX = sourceWidth / targetWidth * 2.54;
  const dpiY = sourceHeight / targetHeight * 2.54;
  const effectiveDpi = Math.round(Math.min(dpiX, dpiY));
  if (effectiveDpi >= 240) {
    card.classList.add("quality-good");
    message.textContent = `Výborná kvalita · približne ${effectiveDpi} DPI v cieľovej veľkosti.`;
  } else if (effectiveDpi >= 150) {
    card.classList.add("quality-medium");
    message.textContent = `Dobrá na bežnú tlač · približne ${effectiveDpi} DPI v cieľovej veľkosti.`;
  } else {
    card.classList.add("quality-low");
    message.textContent = `Nízke rozlíšenie · približne ${effectiveDpi} DPI. Výsledok môže byť rozmazaný.`;
  }
}

function updateLabels() {
  $("#dpi-value").textContent = `${$("#print-dpi").value} DPI`;
  for (const id of filters) {
    const suffix = id === "blur" ? "" : "%";
    $(`#${id}-value`).textContent = `${$(`#${id}`).value}${suffix}`;
  }
  const { width, height } = getPrintSize();
  const preset = $("#paper-preset").value;
  const sizeLabel = preset === "custom" ? `${width} × ${height} cm` : `${preset} · ${width} × ${height} cm`;
  $("#preview-dimensions").textContent = sizeLabel;
  const pixelSize = getOutputDimensions();
  const dpiLabel = pixelSize.dpi < pixelSize.requestedDpi
    ? `${pixelSize.dpi} DPI (limit rozlíšenia)`
    : `${pixelSize.dpi} DPI`;
  $("#canvas-tag").textContent = `${preset === "custom" ? "VLASTNÝ" : preset} · ${dpiLabel}`;
  $("#export-summary").textContent = state.image
    ? `${width} × ${height} cm · ${pixelSize.width} × ${pixelSize.height} px · ${dpiLabel}`
    : "Nahraj obrázok a začni s úpravami.";
}

function render() {
  updateLabels();
  updateQuality();
  if (state.image) {
    const dimensions = getPreviewDimensions();
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    drawArtwork(canvas, dimensions.width, dimensions.height);
    $("#canvas-wrap").hidden = false;
    $("#empty-state").hidden = true;
    $("#download-png").disabled = false;
    $("#download-pdf").disabled = false;
  } else {
    $("#canvas-wrap").hidden = true;
    $("#empty-state").hidden = false;
    $("#download-png").disabled = true;
    $("#download-pdf").disabled = true;
  }
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("Vyber platný obrázok (JPG, PNG alebo WEBP).");
    return;
  }
  const image = new Image();
  const url = URL.createObjectURL(file);
  image.onload = () => {
    if (state.image?.src?.startsWith("blob:")) URL.revokeObjectURL(state.image.src);
    state.image = image;
    state.fileName = (file.name.replace(/\.[^.]+$/, "") || "printscale").replace(/[^\p{L}\p{N}_-]+/gu, "-");
    $("#paper-preset").value = "A4";
    $("#print-width").value = "21";
    $("#print-height").value = "29.7";
    render();
    showToast(`Obrázok načítaný · ${image.naturalWidth} × ${image.naturalHeight} px.`);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    showToast("Obrázok sa nepodarilo načítať. Skús iný formát.");
  };
  image.src = url;
}

function validateSizeInputs() {
  for (const id of ["print-width", "print-height"]) {
    const input = $(`#${id}`);
    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0) input.value = "1";
    if (value > 200) input.value = "200";
  }
}

function configurePaperPreset() {
  const preset = $("#paper-preset").value;
  if (paperSizes[preset]) {
    $("#print-width").value = paperSizes[preset][0];
    $("#print-height").value = paperSizes[preset][1];
  }
  render();
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function withDpiMetadata(pngBytes, dpi) {
  const chunkData = new Uint8Array(9);
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const view = new DataView(chunkData.buffer);
  view.setUint32(0, pixelsPerMeter);
  view.setUint32(4, pixelsPerMeter);
  chunkData[8] = 1;
  const type = new TextEncoder().encode("pHYs");
  const crcInput = new Uint8Array(type.length + chunkData.length);
  crcInput.set(type);
  crcInput.set(chunkData, type.length);
  const chunk = new Uint8Array(4 + crcInput.length + 4);
  const chunkView = new DataView(chunk.buffer);
  chunkView.setUint32(0, chunkData.length);
  chunk.set(crcInput, 4);
  chunkView.setUint32(4 + crcInput.length, crc32(crcInput));
  const result = new Uint8Array(pngBytes.length + chunk.length);
  result.set(pngBytes.subarray(0, 33));
  result.set(chunk, 33);
  result.set(pngBytes.subarray(33), 33 + chunk.length);
  return result;
}

async function createOutputBlob() {
  const { width, height } = getOutputDimensions();
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  drawArtwork(output, width, height);
  const blob = await new Promise((resolve) => output.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Prehliadač nedokázal vytvoriť PNG.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const result = withDpiMetadata(bytes, getOutputDimensions().dpi);
  return new Blob([result], { type: "image/png" });
}

async function downloadPng() {
  try {
    const blob = await createOutputBlob();
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${state.fileName}-print.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`PNG pripravené na tlač · ${getOutputDimensions().dpi} DPI.`);
  } catch (error) {
    showToast(error.message || "PNG sa nepodarilo vytvoriť.");
  }
}

async function downloadPdf() {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Pre export PDF povoľ vyskakovacie okná pre túto stránku.");
    return;
  }
  try {
    printWindow.document.write("<!doctype html><title>Pripravujem tlač…</title><p style='font:16px sans-serif'>Pripravujem súbor na tlač…</p>");
    const blob = await createOutputBlob();
    const imageUrl = URL.createObjectURL(blob);
    const { width, height } = getPrintSize();
    const safeTitle = `${state.fileName}-print.pdf`;
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>@page{size:${width}cm ${height}cm;margin:0}*{box-sizing:border-box}html,body{width:${width}cm;height:${height}cm;margin:0;padding:0;overflow:hidden}img{display:block;width:${width}cm;height:${height}cm;object-fit:fill}@media screen{body{display:grid;place-items:center;background:#333}img{width:min(${width}cm,95vw);height:auto;max-height:95vh;object-fit:contain;box-shadow:0 4px 24px #0008}}</style></head><body><img src="${imageUrl}" alt="Obrázok pripravený na tlač"></body></html>`);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.onafterprint = () => {
        URL.revokeObjectURL(imageUrl);
        printWindow.close();
      };
    };
    showToast("V tlačovom okne vyber možnosť „Uložiť ako PDF“.");
  } catch (error) {
    printWindow.close();
    showToast(error.message || "PDF sa nepodarilo pripraviť.");
  }
}

function multiplyPolynomials(left, right) {
  const result = Array(left.length + right.length - 1).fill(0);
  for (let i = 0; i < left.length; i++) {
    for (let j = 0; j < right.length; j++) result[i + j] ^= gfMultiply(left[i], right[j]);
  }
  return result;
}

function gfMultiply(a, b) {
  let result = 0;
  while (b) {
    if (b & 1) result ^= a;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
    b >>>= 1;
  }
  return result;
}

function makeQrCode(text) {
  const bytes = [...new TextEncoder().encode(text)];
  if (bytes.length > 17) throw new Error("QR kód môže obsahovať najviac 17 bajtov textu.");
  const bits = [];
  const pushBits = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  bytes.forEach((byte) => pushBits(byte, 8));
  for (let i = 0; i < Math.min(4, 152 - bits.length); i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }
  for (let pad = 0; data.length < 19; pad++) data.push(pad % 2 ? 0x11 : 0xec);
  let generator = [1];
  for (let i = 0; i < 7; i++) generator = multiplyPolynomials(generator, [1, 2 ** i]);
  const remainder = data.concat(Array(7).fill(0));
  for (let i = 0; i < data.length; i++) {
    const factor = remainder[i];
    if (factor) for (let j = 0; j < generator.length; j++) remainder[i + j] ^= gfMultiply(generator[j], factor);
  }
  const codewords = data.concat(remainder.slice(data.length));
  const size = 21;
  const matrix = Array.from({ length: size }, () => Array(size).fill(null));

  function setFinder(originX, originY) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const x = originX + dx;
        const y = originY + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        if (dx === -1 || dx === 7 || dy === -1 || dy === 7) matrix[y][x] = false;
        else matrix[y][x] = dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
      }
    }
  }
  setFinder(0, 0);
  setFinder(size - 7, 0);
  setFinder(0, size - 7);
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = false;
    if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = false;
  }
  matrix[size - 8][8] = true;

  const functionCells = matrix.map((row) => row.map((cell) => cell !== null));
  const dataBits = codewords.flatMap((word) => Array.from({ length: 8 }, (_, bit) => (word >>> (7 - bit)) & 1));
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let vert = 0; vert < size; vert++) {
      const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      for (let offset = 0; offset < 2; offset++) {
        const x = right - offset;
        if (matrix[y][x] === null && bitIndex < dataBits.length) matrix[y][x] = Boolean(dataBits[bitIndex++]);
      }
    }
  }

  const base = matrix.map((row) => row.slice());
  const masks = [
    (x, y) => (x + y) % 2 === 0,
    (_x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const formatBits = (mask) => {
    const value = (0b01 << 3) | mask;
    let remainderBits = value << 10;
    for (let bit = 14; bit >= 10; bit--) if ((remainderBits >>> bit) & 1) remainderBits ^= 0x537 << (bit - 10);
    return ((value << 10) | remainderBits) ^ 0x5412;
  };
  function placeFormat(target, mask) {
    const bits = formatBits(mask);
    const first = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
    const second = [[20, 8], [19, 8], [18, 8], [17, 8], [16, 8], [15, 8], [14, 8], [13, 8], [8, 14], [8, 15], [8, 16], [8, 17], [8, 18], [8, 19], [8, 20]];
    for (let i = 0; i < 15; i++) {
      const value = ((bits >>> i) & 1) !== 0;
      target[first[i][1]][first[i][0]] = value;
      target[second[i][1]][second[i][0]] = value;
    }
    target[size - 8][8] = true;
  }
  function penalty(target) {
    let score = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const color = target[y][x];
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && target[y + dy]?.[x + dx] === color) neighbors++;
        }
        if (neighbors > 5) score += neighbors - 2;
        if (x < size - 1 && y < size - 1 && color === target[y][x + 1] && color === target[y + 1][x] && color === target[y + 1][x + 1]) score += 3;
      }
    }
    for (let y = 0; y < size; y++) {
      const line = target[y].map(Number).join("");
      if (line.includes("10111010000") || line.includes("00001011101")) score += 40;
    }
    for (let x = 0; x < size; x++) {
      const line = target.map((row) => Number(row[x])).join("");
      if (line.includes("10111010000") || line.includes("00001011101")) score += 40;
    }
    const dark = target.flat().filter(Boolean).length;
    score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
    return score;
  }
  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = base.map((row) => row.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!functionCells[y][x]) {
        if (masks[mask](x, y)) candidate[y][x] = !candidate[y][x];
      }
    }
    placeFormat(candidate, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function drawQr(context, qr, width, height) {
  const moduleSize = Math.max(1, Math.min(width, height) * 0.16 / 25);
  const codeSize = moduleSize * (qr.length + 4);
  const x = width - codeSize - width * 0.035;
  const y = height - codeSize - height * 0.035;
  context.save();
  context.fillStyle = "#fff";
  context.fillRect(x, y, codeSize, codeSize);
  context.fillStyle = "#101820";
  for (let row = 0; row < qr.length; row++) for (let column = 0; column < qr.length; column++) {
    if (qr[row][column]) context.fillRect(x + (column + 2) * moduleSize, y + (row + 2) * moduleSize, moduleSize, moduleSize);
  }
  context.restore();
}

function resetAll() {
  if (state.image?.src?.startsWith("blob:")) URL.revokeObjectURL(state.image.src);
  state.image = null;
  state.rotation = 0;
  state.grayscale = false;
  state.sepia = false;
  state.zoom = 1;
  state.qr = null;
  $("#canvas-wrap").style.transform = "scale(1)";
  $("#zoom-value").textContent = "100%";
  $("#paper-preset").value = "A4";
  $("#print-width").value = "21";
  $("#print-height").value = "29.7";
  $("#print-dpi").value = "300";
  $("#brightness").value = "100";
  $("#contrast").value = "100";
  $("#saturation").value = "100";
  $("#blur").value = "0";
  $("#overlay-text").value = "";
  $("#frame-toggle").checked = false;
  cropIds.forEach((id) => { $(`#${id}`).value = "0"; });
  $("#grayscale-toggle").setAttribute("aria-pressed", "false");
  $("#sepia-toggle").setAttribute("aria-pressed", "false");
  render();
}

$("#image-upload").addEventListener("change", (event) => loadFile(event.target.files[0]));
$("#empty-upload").addEventListener("click", () => $("#image-upload").click());
$("#upload-zone").addEventListener("dragover", (event) => { event.preventDefault(); $("#upload-zone").classList.add("dragging"); });
$("#upload-zone").addEventListener("dragleave", () => $("#upload-zone").classList.remove("dragging"));
$("#upload-zone").addEventListener("drop", (event) => {
  event.preventDefault();
  $("#upload-zone").classList.remove("dragging");
  loadFile(event.dataTransfer.files[0]);
});
$("#paper-preset").addEventListener("change", configurePaperPreset);
$("#print-width").addEventListener("change", () => { validateSizeInputs(); $("#paper-preset").value = "custom"; render(); });
$("#print-height").addEventListener("change", () => { validateSizeInputs(); $("#paper-preset").value = "custom"; render(); });
allLiveControls.forEach((selector) => $(selector).addEventListener("input", render));
allLiveControls.filter((selector) => selector !== "#paper-preset").forEach((selector) => $(selector).addEventListener("change", render));
$("#rotate-left").addEventListener("click", () => { state.rotation = (state.rotation + 270) % 360; render(); });
$("#rotate-right").addEventListener("click", () => { state.rotation = (state.rotation + 90) % 360; render(); });
$("#grayscale-toggle").addEventListener("click", (event) => {
  state.grayscale = !state.grayscale;
  event.currentTarget.setAttribute("aria-pressed", String(state.grayscale));
  render();
});
$("#sepia-toggle").addEventListener("click", (event) => {
  state.sepia = !state.sepia;
  event.currentTarget.setAttribute("aria-pressed", String(state.sepia));
  render();
});
$("#reset-crop").addEventListener("click", () => {
  cropIds.forEach((id) => { $(`#${id}`).value = "0"; });
  render();
});
$("#add-qr").addEventListener("click", () => {
  const text = $("#qr-text").value.trim();
  if (!text) {
    state.qr = null;
    render();
    showToast("Zadaj text alebo odkaz pre QR kód.");
    return;
  }
  try {
    state.qr = makeQrCode(text);
    render();
    showToast("QR kód bol pridaný do obrázka.");
  } catch (error) {
    showToast(error.message);
  }
});
$("#download-png").addEventListener("click", downloadPng);
$("#download-pdf").addEventListener("click", downloadPdf);
$("#reset-all").addEventListener("click", resetAll);
$("#zoom-in").addEventListener("click", () => {
  state.zoom = Math.min(1.6, state.zoom + 0.1);
  $("#canvas-wrap").style.transform = `scale(${state.zoom})`;
  $("#zoom-value").textContent = `${Math.round(state.zoom * 100)}%`;
});
$("#zoom-out").addEventListener("click", () => {
  state.zoom = Math.max(0.5, state.zoom - 0.1);
  $("#canvas-wrap").style.transform = `scale(${state.zoom})`;
  $("#zoom-value").textContent = `${Math.round(state.zoom * 100)}%`;
});
$("#fit-preview").addEventListener("click", () => {
  state.zoom = 1;
  $("#canvas-wrap").style.transform = "scale(1)";
  $("#zoom-value").textContent = "100%";
});

render();
