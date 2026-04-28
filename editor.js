// ─── Canvas size ────────────────────────────────────────────────────────────
var CANVAS_SIZE = 32;
const selectSize = document.getElementById('selectSize');

// ─── Tool buttons ────────────────────────────────────────────────────────────
const btnPencil   = document.getElementById('btnPencil');
const btnLine     = document.getElementById('btnLine');
const btnEraser   = document.getElementById('btnEraser');
const btnBucket   = document.getElementById('btnBucket');
const btnSelect   = document.getElementById('btnSelect');
const btnPan      = document.getElementById('btnPan');
const btnContour  = document.getElementById('btnContour');

// ─── Zoom / pan state ───────────────────────────────────────────────────────
var scale    = 10.0, minscale = 0.5, maxscale = 30.0;
var panX = 0, panY = 0;
var isPanning = false, startPanX, startPanY;

const btn_ZoomIn  = document.getElementById('btnZoomIn');
const btn_ZoomOut = document.getElementById('btnZoomOut');
const viewPort    = document.getElementById('viewport');
const container   = document.getElementById('canvasContainer');
const zoomDisplay = document.getElementById('zoomDisplay');

// ─── Background canvas ──────────────────────────────────────────────────────
const backGroundCanvas = document.getElementById('backgroundCanvas');

// ─── Paint canvas (active layer — drawn on by the user) ─────────────────────
const paintCanvas = document.getElementById('paintCanvas');
const paintCtx    = paintCanvas.getContext('2d');

// ─── Onion skin canvas ──────────────────────────────────────────────────────
const onionCanvas = document.getElementById('onionCanvas');
const onionCtx    = onionCanvas.getContext('2d');

// ─── Below / above layer context canvases (visible in the drawing area) ─────
const layersBelowCanvas = document.getElementById('layersBelowCanvas');
const layersBelowCtx    = layersBelowCanvas.getContext('2d');
const layersAboveCanvas = document.getElementById('layersAboveCanvas');
const layersAboveCtx    = layersAboveCanvas.getContext('2d');

// ─── Merge canvas (off-screen composite of all layers) ──────────────────────
const mergeCanvas = document.createElement('canvas');
mergeCanvas.width  = CANVAS_SIZE;
mergeCanvas.height = CANVAS_SIZE;
const mergeCtx = mergeCanvas.getContext('2d');

// ─── UI elements ────────────────────────────────────────────────────────────
const colorPicker     = document.getElementById('colorPicker');
const frameIndicator  = document.getElementById('frameIndicator');
const chkOnion        = document.getElementById('chkOnion');

const btnPrev          = document.getElementById('btnPrev');
const btnNext          = document.getElementById('btnNext');
const btnAdd           = document.getElementById('btnAddFrame');
const btnDuplicate     = document.getElementById('btnDuplicateFrame');
const btnDelete        = document.getElementById('btnDeleteFrame');

const btnExport        = document.getElementById('btnExport');
const btnExportGif     = document.getElementById('btnExportGif');
const btnClear         = document.getElementById('btnClearFrame');

const previewCanvas    = document.getElementById('previewCanvas');
const previewCtx       = previewCanvas.getContext('2d');
const fpsInput         = document.getElementById('fpsInput');

const paletteRows      = document.getElementById('paletteRows');
const paleteColorPicker= document.getElementById('paleteColorPicker');
const btnAddPaletteRow = document.getElementById('btnAddPaletteRow');

const gridCanvas = document.getElementById('gridCanvas');
const gridCtx    = gridCanvas.getContext('2d');
const chkGrid    = document.getElementById('chkGrid');

const inputLoadPng = document.getElementById('inputLoadPng');
const btnLoadPng   = document.getElementById('btnLoadPng');

const colorWheelToggle = document.getElementById('colorWheelToggle');
const colorWheelBody   = document.getElementById('colorWheelBody');
const collapseChevron  = colorWheelToggle.querySelector('.collapseChevron');

// ─── Layer UI elements ──────────────────────────────────────────────────────
const layerList        = document.getElementById('layerList');
const btnAddLayer      = document.getElementById('btnAddLayer');
const btnDuplicateLayer= document.getElementById('btnDuplicateLayer');
const btnDeleteLayer   = document.getElementById('btnDeleteLayer');
const btnMoveLayerUp   = document.getElementById('btnMoveLayerUp');
const btnMoveLayerDown = document.getElementById('btnMoveLayerDown');
const layerOpacitySlider = document.getElementById('layerOpacity');
const layerOpacityValue  = document.getElementById('layerOpacityValue');

// ─── Tool state ─────────────────────────────────────────────────────────────
var currentTool = 'pencil';
var startX, startY;
var snapshot;
var selection  = { active: false, x: 0, y: 0, w: 0, h: 0, data: null, isMoving: false };
var clipboard  = null;
var isDrawing  = false;

// ─── History ────────────────────────────────────────────────────────────────
var historyStack = [];

function saveStateForUndo() {
    historyStack.push({
        layers: layers.map(l => ({
            name:    l.name,
            visible: l.visible,
            opacity: l.opacity,
            frames:  [...l.frames]
        })),
        currentLayerIndex: currentLayerIndex,
        currentFrameIndex: currentFrameIndex
    });
    if (historyStack.length > 50) historyStack.shift();
}

function undo() {
    if (historyStack.length === 0) return;
    const prev = historyStack.pop();
    layers = prev.layers.map(l => ({
        name:    l.name,
        visible: l.visible,
        opacity: l.opacity,
        frames:  [...l.frames]
    }));
    currentLayerIndex = prev.currentLayerIndex;
    currentFrameIndex = prev.currentFrameIndex;

    loadFrame(currentFrameIndex);
    renderLayerPanel();
    drawLayerContext();
    if (typeof restartPreview === 'function') restartPreview();
    selection.active = false;
    drawGrid();
}

// ─── LAYER MODEL ────────────────────────────────────────────────────────────
// layers[i].frames[j] = dataURL string for layer i, frame j
var layers = [];
var currentLayerIndex = 0;

// total frames count is driven by layers[0].frames.length
var currentFrameIndex = 0;

function frameCount() {
    return layers.length > 0 ? layers[0].frames.length : 1;
}

function blankDataURL() {
    const tmp = document.createElement('canvas');
    tmp.width  = CANVAS_SIZE;
    tmp.height = CANVAS_SIZE;
    return tmp.toDataURL();
}

function createLayer(name, frameCount) {
    const frames = [];
    for (let i = 0; i < frameCount; i++) frames.push(blankDataURL());
    return { name: name || 'Layer', visible: true, opacity: 1.0, frames };
}

// Initialise with one layer + one frame
function initLayers() {
    layers = [createLayer('Layer 1', 1)];
    currentLayerIndex = 0;
    currentFrameIndex = 0;
}

// ─── Composite all visible layers → mergeCanvas ─────────────────────────────
function compositeFrame(frameIndex) {
    mergeCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    // Draw bottom → top
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (!layer.visible) continue;
        const img = new Image();
        // Synchronous trick: since all frames are already dataURLs we can create
        // a temporary canvas and draw immediately.
        const tmp = document.createElement('canvas');
        tmp.width  = CANVAS_SIZE;
        tmp.height = CANVAS_SIZE;
        const tCtx = tmp.getContext('2d');
        tCtx.imageSmoothingEnabled = false;

        // We need the image loaded — wrap in a promise queue approach.
        // For export we use the async version (compositeFrameAsync).
        // Here we keep it synchronous via a pre-loaded image trick.
        img.src = layer.frames[frameIndex];
        mergeCtx.globalAlpha = layer.opacity;
        mergeCtx.drawImage(img, 0, 0);
        mergeCtx.globalAlpha = 1;
    }
    return mergeCanvas.toDataURL();
}

async function compositeFrameAsync(frameIndex) {
    mergeCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (!layer.visible) continue;
        await new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                mergeCtx.globalAlpha = layer.opacity;
                mergeCtx.drawImage(img, 0, 0);
                mergeCtx.globalAlpha = 1;
                resolve();
            };
            img.src = layer.frames[frameIndex];
        });
    }
    return mergeCanvas.toDataURL();
}

// ─── Draw visible non-selected layers into the two context canvases ──────────
// layers are ordered index 0 = top, index N-1 = bottom (same as layer panel).
// "below" means higher index numbers (drawn first, underneath the active layer).
// "above" means lower index numbers (drawn last, on top of the active layer).
async function drawLayerContext() {
    layersBelowCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    layersAboveCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const fi = currentFrameIndex;
    const ci = currentLayerIndex;

    // ── Layers BELOW the active one (higher indices → draw bottom-up) ────────
    // We want the visual stack to look correct: draw from the very bottom up
    // so that lower-index "below" layers end up on top of higher-index ones.
    for (let i = layers.length - 1; i > ci; i--) {
        const layer = layers[i];
        if (!layer.visible) continue;
        await new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                layersBelowCtx.globalAlpha = layer.opacity;
                layersBelowCtx.drawImage(img, 0, 0);
                layersBelowCtx.globalAlpha = 1;
                resolve();
            };
            img.src = layer.frames[fi];
        });
    }

    // ── Layers ABOVE the active one (lower indices → draw top-most last) ─────
    for (let i = layers.length - 1; i >= 0; i--) {
        if (i >= ci) continue; // skip active and below
        const layer = layers[i];
        if (!layer.visible) continue;
        await new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                layersAboveCtx.globalAlpha = layer.opacity;
                layersAboveCtx.drawImage(img, 0, 0);
                layersAboveCtx.globalAlpha = 1;
                resolve();
            };
            img.src = layer.frames[fi];
        });
    }
}

// ─── Save the current paintCanvas state into the active layer ────────────────
function saveCurrentLayer() {
    layers[currentLayerIndex].frames[currentFrameIndex] = paintCanvas.toDataURL();
    // Redraw context canvases so thumbnails & panel reflect latest pixels
    drawLayerContext();
}

// Alias kept for compatibility with legacy call sites
function saveCurrentFrame() {
    saveCurrentLayer();
}

// ─── Load paintCanvas from the active layer ──────────────────────────────────
function loadActiveLayer(callback) {
    const src = layers[currentLayerIndex].frames[currentFrameIndex];
    const img = new Image();
    img.onload = () => {
        paintCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        paintCtx.drawImage(img, 0, 0);
        if (callback) callback();
    };
    img.src = src;
}

// ─── Load a frame (update paintCanvas + onion skin + UI) ────────────────────
function loadFrame(index) {
    currentFrameIndex = index;
    loadActiveLayer(() => {
        drawOnionSkin();
        drawLayerContext();
        updateUI();
    });
}

// ─── Preview uses the composite of all layers ────────────────────────────────
var previewFrameIndex = 0;
var previewTimeout    = null;

async function updatePreview() {
    if (layers.length === 0 || frameCount() === 0) return;

    const dataURL = await compositeFrameAsync(previewFrameIndex);
    const img = new Image();
    img.onload = () => {
        previewCtx.clearRect(0, 0, 32, 32);
        previewCtx.drawImage(img, 0, 0);

        previewFrameIndex = (previewFrameIndex + 1) % frameCount();
        const delay = 1000 / parseInt(fpsInput.value || 8);
        previewTimeout = setTimeout(updatePreview, delay);
    };
    img.src = dataURL;
}

function restartPreview() {
    clearTimeout(previewTimeout);
    updatePreview();
}

// ─── LAYER PANEL RENDERING ──────────────────────────────────────────────────
function renderLayerPanel() {
    layerList.innerHTML = '';

    layers.forEach((layer, index) => {
        const item = document.createElement('div');
        item.className = 'layer-item' + (index === currentLayerIndex ? ' layer-active' : '');
        item.dataset.index = index;

        // Thumbnail
        const thumb = document.createElement('canvas');
        thumb.width  = CANVAS_SIZE;
        thumb.height = CANVAS_SIZE;
        thumb.className = 'layer-thumb';
        const tCtx = thumb.getContext('2d');
        tCtx.imageSmoothingEnabled = false;
        const img = new Image();
        img.onload = () => tCtx.drawImage(img, 0, 0);
        img.src = layer.frames[currentFrameIndex];

        // Visibility toggle
        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'layer-eye' + (layer.visible ? '' : ' layer-eye--hidden');
        eyeBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
        eyeBtn.innerHTML = `<span class="material-symbols-outlined">${layer.visible ? 'visibility' : 'visibility_off'}</span>`;
        eyeBtn.onclick = (e) => {
            e.stopPropagation();
            layer.visible = !layer.visible;
            drawLayerContext();
            renderLayerPanel();
            restartPreview();
        };

        // Name (editable)
        const nameEl = document.createElement('span');
        nameEl.className = 'layer-name';
        nameEl.textContent = layer.name;
        nameEl.contentEditable = 'true';
        nameEl.spellcheck = false;
        nameEl.onblur = () => { layer.name = nameEl.textContent.trim() || layer.name; };
        nameEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); } };
        nameEl.onclick = (e) => e.stopPropagation();

        item.appendChild(thumb);
        item.appendChild(eyeBtn);
        item.appendChild(nameEl);

        item.onclick = () => selectLayer(index);
        layerList.appendChild(item);
    });

    // Update opacity slider
    const activeLayer = layers[currentLayerIndex];
    if (activeLayer) {
        layerOpacitySlider.value = Math.round(activeLayer.opacity * 100);
        layerOpacityValue.textContent = Math.round(activeLayer.opacity * 100) + '%';
    }
}

function selectLayer(index) {
    saveCurrentLayer();
    currentLayerIndex = index;
    loadActiveLayer(() => {
        drawOnionSkin();
        drawLayerContext();
        renderLayerPanel();
    });
}

// ─── LAYER OPERATIONS ───────────────────────────────────────────────────────
function addLayer() {
    saveStateForUndo();
    const fc = frameCount();
    const newLayer = createLayer(`Layer ${layers.length + 1}`, fc);
    layers.unshift(newLayer);   // Add on top
    currentLayerIndex = 0;
    loadActiveLayer(() => { drawOnionSkin(); drawLayerContext(); renderLayerPanel(); });
}

function duplicateLayer() {
    saveStateForUndo();
    saveCurrentLayer();
    const src = layers[currentLayerIndex];
    const dup = {
        name:    src.name + ' copy',
        visible: src.visible,
        opacity: src.opacity,
        frames:  [...src.frames]
    };
    layers.splice(currentLayerIndex, 0, dup);
    // currentLayerIndex stays the same (dup is inserted above current)
    renderLayerPanel();
}

function deleteLayer() {
    if (layers.length <= 1) { alert('Cannot delete the only layer.'); return; }
    saveStateForUndo();
    layers.splice(currentLayerIndex, 1);
    if (currentLayerIndex >= layers.length) currentLayerIndex = layers.length - 1;
    loadActiveLayer(() => { drawOnionSkin(); drawLayerContext(); renderLayerPanel(); });
}

function moveLayerUp() {
    if (currentLayerIndex === 0) return;
    saveStateForUndo();
    saveCurrentLayer();
    [layers[currentLayerIndex - 1], layers[currentLayerIndex]] =
        [layers[currentLayerIndex], layers[currentLayerIndex - 1]];
    currentLayerIndex--;
    drawLayerContext();
    renderLayerPanel();
}

function moveLayerDown() {
    if (currentLayerIndex === layers.length - 1) return;
    saveStateForUndo();
    saveCurrentLayer();
    [layers[currentLayerIndex + 1], layers[currentLayerIndex]] =
        [layers[currentLayerIndex], layers[currentLayerIndex + 1]];
    currentLayerIndex++;
    drawLayerContext();
    renderLayerPanel();
}

// ─── COLOR HELPERS ──────────────────────────────────────────────────────────
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b, a: 255 };
}

function hexToHsl(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

// ─── PALETTE ────────────────────────────────────────────────────────────────
function createPaletteRow(baseHex) {
    const hsl = hexToHsl(baseHex);
    const row = document.createElement('div');
    row.className = 'palette-row';
    const offsets = [-30, -25, -20, -15, -10, 0, 10, 15, 20, 25, 30];
    offsets.forEach(offset => {
        const newL = Math.max(0, Math.min(100, hsl.l + offset));
        const hex  = hslToHex(hsl.h, hsl.s, newL);
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = hex;
        swatch.title = hex;
        swatch.onclick = () => {
            colorPicker.value = hex;
            if (currentTool === 'eraser') setTool('pencil');
        };
        row.appendChild(swatch);
    });
    paletteRows.appendChild(row);
}

// ─── FLOOD FILL ─────────────────────────────────────────────────────────────
function floodFill(startX, startY, fillColor) {
    const imageData = paintCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const pixels    = imageData.data;
    const startPos  = (startY * CANVAS_SIZE + startX) * 4;
    const startR    = pixels[startPos];
    const startG    = pixels[startPos + 1];
    const startB    = pixels[startPos + 2];
    const startA    = pixels[startPos + 3];

    const matchColor = (pos) => {
        const a = pixels[pos + 3];
        if (startA === 0 && a === 0) return true;
        const tolerance = 5;
        return Math.abs(pixels[pos]     - startR) <= tolerance &&
               Math.abs(pixels[pos + 1] - startG) <= tolerance &&
               Math.abs(pixels[pos + 2] - startB) <= tolerance &&
               Math.abs(a               - startA) <= tolerance;
    };

    if (matchColor(startPos) &&
        Math.abs(fillColor.r - startR) <= 5 &&
        Math.abs(fillColor.g - startG) <= 5 &&
        Math.abs(fillColor.b - startB) <= 5 &&
        Math.abs(fillColor.a - startA) <= 5) return;

    pixels[startPos]     = fillColor.r;
    pixels[startPos + 1] = fillColor.g;
    pixels[startPos + 2] = fillColor.b;
    pixels[startPos + 3] = fillColor.a;

    const stack = [[startX, startY]];
    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const checkAndPush = (nx, ny) => {
            if (nx >= 0 && nx < CANVAS_SIZE && ny >= 0 && ny < CANVAS_SIZE) {
                const pos = (ny * CANVAS_SIZE + nx) * 4;
                if (matchColor(pos)) {
                    pixels[pos]     = fillColor.r;
                    pixels[pos + 1] = fillColor.g;
                    pixels[pos + 2] = fillColor.b;
                    pixels[pos + 3] = fillColor.a;
                    stack.push([nx, ny]);
                }
            }
        };
        checkAndPush(x - 1, y);
        checkAndPush(x + 1, y);
        checkAndPush(x, y - 1);
        checkAndPush(x, y + 1);
    }
    paintCtx.putImageData(imageData, 0, 0);
    saveCurrentFrame();
}

// ─── PNG LOAD / IMPORT ──────────────────────────────────────────────────────
function loadPNG(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const h = img.height, w = img.width;
            if (h > w) { alert('Erro: A altura é maior que a largura.'); return; }
            const tamanhosPadrao = [16, 24, 32, 48, 64, 96, 128, 256, 512];
            if (!tamanhosPadrao.includes(h)) {
                alert(`Erro: Altura (${h}px) não corresponde a nenhum tamanho padrão.`); return;
            }
            if (w % h !== 0) {
                alert(`Erro: Largura (${w}px) não é múltiplo da altura (${h}px).`); return;
            }
            if (confirm(`${h}x${h}px por frame. Isso substituirá o projeto atual. Continuar?`)) {
                importSpritesheet(img, h);
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function importSpritesheet(img, size) {
    CANVAS_SIZE = size;
    selectSize.value = size;

    resizeAllCanvases();

    const numFrames = img.width / size;
    const tempCanvas = document.createElement('canvas');
    const tempCtx    = tempCanvas.getContext('2d');
    tempCanvas.width  = size;
    tempCanvas.height = size;

    const frameData = [];
    for (let i = 0; i < numFrames; i++) {
        tempCtx.clearRect(0, 0, size, size);
        tempCtx.drawImage(img, i * size, 0, size, size, 0, 0, size, size);
        frameData.push(tempCanvas.toDataURL());
    }

    // Replace layer 0 frames; keep other layers but match frame count
    layers = [{ name: 'Layer 1', visible: true, opacity: 1.0, frames: frameData }];
    currentLayerIndex = 0;
    historyStack = [];

    loadFrame(frameCount() - 1);
    drawOnionSkin();
    renderLayerPanel();
    restartPreview();
    alert(`Sucesso! ${numFrames} frames carregados.`);
}

// ─── EXPORT PNG (composite) ─────────────────────────────────────────────────
async function exportPNG() {
    saveCurrentLayer();
    const fc = frameCount();
    if (fc === 0) return;

    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width  = CANVAS_SIZE * fc;
    sheetCanvas.height = CANVAS_SIZE;
    const sCtx = sheetCanvas.getContext('2d');
    sCtx.imageSmoothingEnabled = false;

    for (let f = 0; f < fc; f++) {
        const dataURL = await compositeFrameAsync(f);
        await new Promise(resolve => {
            const img = new Image();
            img.onload = () => { sCtx.drawImage(img, f * CANVAS_SIZE, 0); resolve(); };
            img.src = dataURL;
        });
    }

    const link = document.createElement('a');
    link.download = `spritesheet_${fc}frames.png`;
    link.href = sheetCanvas.toDataURL();
    link.click();
}

// ─── EXPORT GIF (composite) ─────────────────────────────────────────────────
import { GIFEncoder, quantize, applyPalette } from 'https://unpkg.com/gifenc@1.0.3';

async function exportGif() {
    const fc = frameCount();
    if (fc === 0) { alert('Adicione pelo menos um frame!'); return; }

    const encoder = GIFEncoder();
    const fps     = parseInt(fpsInput.value || 8);
    const delay   = 1000 / fps;

    const tempCanvas = document.createElement('canvas');
    const tempCtx    = tempCanvas.getContext('2d');
    tempCanvas.width  = CANVAS_SIZE;
    tempCanvas.height = CANVAS_SIZE;

    for (let f = 0; f < fc; f++) {
        const dataURL = await compositeFrameAsync(f);
        await new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                tempCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
                tempCtx.drawImage(img, 0, 0);
                resolve();
            };
            img.src = dataURL;
        });

        const imageData = tempCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        const { data } = imageData;
        const palette  = quantize(data, 256);
        const index    = applyPalette(data, palette);

        let transparentIndex = -1;
        for (let i = 0; i < palette.length; i++) {
            if (palette[i][3] === 0) { transparentIndex = i; break; }
        }
        const containsTransparence = transparentIndex !== -1;
        if (transparentIndex === -1) transparentIndex = 0;

        encoder.writeFrame(index, CANVAS_SIZE, CANVAS_SIZE, {
            palette, delay,
            transparent: containsTransparence,
            transparentIndex,
            disposal: 2
        });
    }

    encoder.finish();
    const buffer = encoder.bytes();
    const blob   = new Blob([buffer], { type: 'image/gif' });
    const url    = URL.createObjectURL(blob);
    const link   = document.createElement('a');
    link.href = url;
    link.download = 'pixel-art.gif';
    link.click();
    URL.revokeObjectURL(url);
}

// ─── CONTOUR ────────────────────────────────────────────────────────────────
function applyContour() {
    saveStateForUndo();
    const imageData = paintCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const src = new Uint8ClampedArray(imageData.data);
    const dst = imageData.data;
    const fill = hexToRgb(colorPicker.value);
    const idx  = (x, y) => (y * CANVAS_SIZE + x) * 4;
    const isOpaque = (x, y) => {
        if (x < 0 || x >= CANVAS_SIZE || y < 0 || y >= CANVAS_SIZE) return false;
        return src[idx(x, y) + 3] > 10;
    };
    const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let y = 0; y < CANVAS_SIZE; y++) {
        for (let x = 0; x < CANVAS_SIZE; x++) {
            const i = idx(x, y);
            if (src[i + 3] <= 10 && neighbors.some(([dx, dy]) => isOpaque(x + dx, y + dy))) {
                dst[i]     = fill.r;
                dst[i + 1] = fill.g;
                dst[i + 2] = fill.b;
                dst[i + 3] = 255;
            }
        }
    }
    paintCtx.putImageData(imageData, 0, 0);
    saveCurrentFrame();
    restartPreview();
}

// ─── GRID ───────────────────────────────────────────────────────────────────
function drawGrid() {
    gridCtx.clearRect(0, 0, CANVAS_SIZE * scale, CANVAS_SIZE * scale);
    if (scale >= 5 && chkGrid.checked) {
        gridCtx.strokeStyle = 'rgba(255,255,255,0.15)';
        gridCtx.lineWidth   = 0.5;
        gridCtx.beginPath();
        for (let i = 0; i <= CANVAS_SIZE; i++) {
            gridCtx.moveTo(i * scale, 0);
            gridCtx.lineTo(i * scale, CANVAS_SIZE * scale);
            gridCtx.moveTo(0, i * scale);
            gridCtx.lineTo(CANVAS_SIZE * scale, i * scale);
        }
        gridCtx.stroke();
    }
    if (currentTool === 'select' && selection.active) {
        gridCtx.strokeStyle = '#ff0000';
        gridCtx.lineWidth   = 0.5;
        gridCtx.setLineDash([2, 2]);
        gridCtx.strokeRect(
            selection.x * scale, selection.y * scale,
            selection.w * scale, selection.h * scale
        );
        gridCtx.setLineDash([]);
    }
}

// ─── UI ─────────────────────────────────────────────────────────────────────
function updateUI() {
    frameIndicator.innerText = `Frame: ${currentFrameIndex + 1} / ${frameCount()}`;
    btnPrev.disabled = currentFrameIndex === 0;
    btnNext.disabled = currentFrameIndex === frameCount() - 1;
    renderLayerPanel();
}

function setTool(tool) {
    currentTool = tool;
    [btnPencil, btnEraser, btnBucket, btnLine, btnSelect, btnPan, btnContour].forEach(
        b => b.classList.remove('active-tool')
    );
    if (tool === 'pencil')  btnPencil.classList.add('active-tool');
    if (tool === 'eraser')  btnEraser.classList.add('active-tool');
    if (tool === 'bucket')  btnBucket.classList.add('active-tool');
    if (tool === 'line')    btnLine.classList.add('active-tool');
    if (tool === 'pan')     btnPan.classList.add('active-tool');
    if (tool === 'select')  btnSelect.classList.add('active-tool');
    else {
        selection.active   = false;
        selection.data     = null;
        selection.isMoving = false;
        drawGrid();
    }
}

// ─── ONION SKIN ─────────────────────────────────────────────────────────────
function drawOnionSkin() {
    onionCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (!chkOnion.checked || currentFrameIndex === 0) return;
    const prevData = layers[currentLayerIndex].frames[currentFrameIndex - 1];
    const img = new Image();
    img.onload = () => onionCtx.drawImage(img, 0, 0);
    img.src = prevData;
}

// ─── FRAME NAVIGATION ───────────────────────────────────────────────────────
function nextFrame() {
    if (currentFrameIndex < frameCount() - 1) {
        saveCurrentLayer();
        loadFrame(currentFrameIndex + 1);
    }
}

function prevFrame() {
    if (currentFrameIndex > 0) {
        saveCurrentLayer();
        loadFrame(currentFrameIndex - 1);
    }
}

function addNewFrame() {
    saveStateForUndo();
    saveCurrentLayer();
    // Add a blank frame to every layer
    layers.forEach(l => l.frames.push(blankDataURL()));
    loadFrame(frameCount() - 1);
}

function duplicateFrame() {
    saveStateForUndo();
    saveCurrentLayer();
    const fi = currentFrameIndex;
    layers.forEach(l => l.frames.splice(fi + 1, 0, l.frames[fi]));
    loadFrame(fi + 1);
}

function deleteFrame() {
    if (frameCount() <= 1) { alert('Não é possível excluir o único frame.'); return; }
    saveStateForUndo();
    const fi = currentFrameIndex;
    layers.forEach(l => l.frames.splice(fi, 1));
    const newFi = Math.min(fi, frameCount() - 1);
    loadFrame(newFi);
    restartPreview();
}

// ─── DRAWING ────────────────────────────────────────────────────────────────
function getMousePos(e) {
    const rect = paintCanvas.getBoundingClientRect();
    return {
        x: Math.floor((e.clientX - rect.left) * (CANVAS_SIZE / rect.width)),
        y: Math.floor((e.clientY - rect.top)  * (CANVAS_SIZE / rect.height))
    };
}

function draw(e) {
    if (!isDrawing) return;
    const { x, y } = getMousePos(e);
    if (currentTool === 'select') {
        if (selection.isMoving) {
            const dx = x - startX, dy = y - startY;
            selection.x += dx; selection.y += dy;
            startX = x; startY = y;
        } else {
            const rect = getSelectionPath(startX, startY, x, y);
            selection = { ...selection, ...rect, active: true };
        }
        drawGrid();
        return;
    }
    if (currentTool === 'pencil') {
        paintCtx.fillStyle = colorPicker.value;
        paintCtx.fillRect(x, y, 1, 1);
    } else if (currentTool === 'eraser') {
        paintCtx.clearRect(x, y, 1, 1);
    } else if (currentTool === 'line') {
        paintCtx.putImageData(snapshot, 0, 0);
        drawPixelLine(startX, startY, x, y, colorPicker.value, false);
    }
}

function drawPixelLine(x0, y0, x1, y1, color, isEraser = false) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    paintCtx.fillStyle = color;
    while (true) {
        if (isEraser) paintCtx.clearRect(x0, y0, 1, 1);
        else          paintCtx.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 <  dx) { err += dx; y0 += sy; }
    }
}

function getSelectionPath(x1, y1, x2, y2) {
    return { x: Math.min(x1, x2), y: Math.min(y1, y2),
             w: Math.abs(x2 - x1) + 1, h: Math.abs(y2 - y1) + 1 };
}

function isPointInSelection(x, y) {
    return selection.active &&
           x >= selection.x && x < selection.x + selection.w &&
           y >= selection.y && y < selection.y + selection.h;
}

function clearFrame() {
    saveStateForUndo();
    paintCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    saveCurrentFrame();
}

// ─── ZOOM / PAN / VIEW ──────────────────────────────────────────────────────
function updateView() {
    container.style.transform = `translate(${panX}px, ${panY}px)`;
    gridCanvas.width  = CANVAS_SIZE * scale;
    gridCanvas.height = CANVAS_SIZE * scale;
    container.style.width  = CANVAS_SIZE * scale + 'px';
    container.style.height = CANVAS_SIZE * scale + 'px';
    zoomDisplay.innerText = `${Math.round(scale * 100)}%`;
    drawGrid();
}

function zoomWheel(e) {
    e.preventDefault();
    const zoomSpeed = 0.5;
    const delta     = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
    const oldScale  = scale;
    let newScale    = Math.min(maxscale, Math.max(minscale, scale + delta));
    if (newScale === oldScale) return;

    const rect   = viewPort.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const pointX = (mouseX - panX) / oldScale;
    const pointY = (mouseY - panY) / oldScale;

    scale = newScale;
    panX  = mouseX - pointX * scale;
    panY  = mouseY - pointY * scale;
    updateView();
}

function adjustZoom(delta) {
    scale = Math.min(maxscale, Math.max(minscale, scale + delta));
    updateView();
}

function adjustViewPort() {
    viewPort.style.width  = window.innerWidth + 'px';
    viewPort.style.height = window.innerHeight + 'px';
    panX = 0; panY = 0;
    updateView();
}

// ─── CANVAS RESIZE ──────────────────────────────────────────────────────────
function resizeAllCanvases() {
    [paintCanvas, onionCanvas, layersBelowCanvas, layersAboveCanvas].forEach(c => {
        c.width  = CANVAS_SIZE;
        c.height = CANVAS_SIZE;
    });
    mergeCanvas.width  = CANVAS_SIZE;
    mergeCanvas.height = CANVAS_SIZE;
    backGroundCanvas.width  = CANVAS_SIZE;
    backGroundCanvas.height = CANVAS_SIZE;
    backGroundCanvas.style.backgroundSize =
        `${100 / (CANVAS_SIZE / 2)}% ${100 / (CANVAS_SIZE / 2)}%`;
    previewCanvas.width  = CANVAS_SIZE;
    previewCanvas.height = CANVAS_SIZE;
    gridCanvas.width     = CANVAS_SIZE * scale;
    gridCanvas.height    = CANVAS_SIZE * scale;
    paintCtx.imageSmoothingEnabled        = false;
    onionCtx.imageSmoothingEnabled        = false;
    layersBelowCtx.imageSmoothingEnabled  = false;
    layersAboveCtx.imageSmoothingEnabled  = false;
    mergeCtx.imageSmoothingEnabled        = false;
    previewCtx.imageSmoothingEnabled      = false;
}

function updateCanvasResolution(newSize) {
    if (!confirm('Alterar o tamanho irá limpar o progresso atual. Continuar?')) {
        selectSize.value = CANVAS_SIZE; return;
    }
    CANVAS_SIZE = parseInt(newSize);
    resizeAllCanvases();
    historyStack = [];
    initLayers();
    loadFrame(0);
    renderLayerPanel();
    drawGrid();
}

// ─── COLOR PICKER SYNC ──────────────────────────────────────────────────────
function syncColorPickers(e) {
    colorPicker.value    = e.target.value;
    paleteColorPicker.value = e.target.value;
}

// ─── PAGE LOAD ──────────────────────────────────────────────────────────────
function pageLoad() {
    viewPort.style.width  = (window.innerWidth - 40) + 'px';
    viewPort.style.height = (window.innerHeight - 100) + 'px';
    window.onresize = () => adjustViewPort();

    paintCtx.imageSmoothingEnabled        = false;
    onionCtx.imageSmoothingEnabled        = false;
    layersBelowCtx.imageSmoothingEnabled  = false;
    layersAboveCtx.imageSmoothingEnabled  = false;
    mergeCtx.imageSmoothingEnabled        = false;
    previewCtx.imageSmoothingEnabled      = false;

    selectSize.addEventListener('change', e => updateCanvasResolution(e.target.value));

    // ── Keyboard shortcuts ──────────────────────────────────────────────────
    window.addEventListener('keydown', e => {
        if (e.key.toLowerCase() === 'p') setTool('pencil');
        if (e.key.toLowerCase() === 'e') setTool('eraser');
        if (e.key.toLowerCase() === 'l') setTool('line');
        if (e.key.toLowerCase() === 'b') setTool('bucket');
        if (e.key.toLowerCase() === 's') setTool('select');
        if (e.key.toLowerCase() === 'o') {
            btnContour.classList.add('active-tool');
            applyContour();
            setTimeout(() => btnContour.classList.remove('active-tool'), 300);
        }
        if (e.code === 'Space') {
            setTool('pan');
            document.getElementById('viewport').classList.add('pan-tool-active');
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'z') undo();
        if (e.ctrlKey && e.key === 'c' && selection.active) {
            clipboard = paintCtx.getImageData(selection.x, selection.y, selection.w, selection.h);
        }
        if (e.ctrlKey && e.key === 'v' && clipboard) {
            saveStateForUndo();
            paintCtx.putImageData(clipboard, selection.x, selection.y);
            saveCurrentFrame();
        }
    });

    // ── Tool buttons ────────────────────────────────────────────────────────
    btnPencil.onclick  = () => setTool('pencil');
    btnEraser.onclick  = () => setTool('eraser');
    btnBucket.onclick  = () => setTool('bucket');
    btnLine.onclick    = () => setTool('line');
    btnSelect.onclick  = () => setTool('select');
    btn_ZoomIn.onclick = () => adjustZoom(0.5);
    btn_ZoomOut.onclick= () => adjustZoom(-0.5);
    btnPan.onclick     = () => setTool('pan');
    btnContour.onclick = () => {
        btnContour.classList.add('active-tool');
        applyContour();
        setTimeout(() => btnContour.classList.remove('active-tool'), 300);
    };

    // ── Layer buttons ───────────────────────────────────────────────────────
    btnAddLayer.onclick       = addLayer;
    btnDuplicateLayer.onclick = duplicateLayer;
    btnDeleteLayer.onclick    = deleteLayer;
    btnMoveLayerUp.onclick    = moveLayerUp;
    btnMoveLayerDown.onclick  = moveLayerDown;

    layerOpacitySlider.addEventListener('input', () => {
        const val = parseInt(layerOpacitySlider.value);
        layers[currentLayerIndex].opacity = val / 100;
        layerOpacityValue.textContent = val + '%';
        drawLayerContext();
        renderLayerPanel();
        restartPreview();
    });

    // ── Initial pan position ────────────────────────────────────────────────
    panX = (window.innerWidth - CANVAS_SIZE * scale) / 2;
    panY = 20;

    colorPicker.onchange     = e => syncColorPickers(e);
    paleteColorPicker.onchange = e => syncColorPickers(e);

    viewPort.addEventListener('wheel', e => zoomWheel(e), { passive: false });
    btnClear.addEventListener('click', clearFrame);
    chkGrid.addEventListener('change', drawGrid);
    drawGrid();

    backGroundCanvas.style.backgroundSize =
        `${100 / (CANVAS_SIZE / 2)}% ${100 / (CANVAS_SIZE / 2)}%`;

    // ── Paint canvas mouse events ────────────────────────────────────────────
    paintCanvas.addEventListener('mousedown', e => {
        isDrawing = true;
        const { x, y } = getMousePos(e);
        startX = x; startY = y;

        if (currentTool === 'pan') {
            isPanning = true;
            startPanX = e.clientX - panX;
            startPanY = e.clientY - panY;
            return;
        }

        saveStateForUndo();

        if (currentTool === 'select') {
            if (isPointInSelection(x, y)) {
                selection.isMoving = true;
                if (!selection.data) {
                    selection.data = paintCtx.getImageData(
                        selection.x, selection.y, selection.w, selection.h
                    );
                    paintCtx.clearRect(selection.x, selection.y, selection.w, selection.h);
                }
            } else {
                selection.active   = false;
                selection.data     = null;
                selection.isMoving = false;
            }
        } else if (currentTool === 'bucket') {
            floodFill(startX, startY, hexToRgb(colorPicker.value));
        } else if (currentTool === 'line') {
            snapshot = paintCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
            draw(e);
        } else {
            draw(e);
        }
    });

    paintCanvas.addEventListener('mouseup', () => {
        if (isDrawing && currentTool === 'select' && selection.isMoving && selection.data) {
            paintCtx.putImageData(selection.data, selection.x, selection.y);
            selection.data     = null;
            selection.isMoving = false;
        }
        isDrawing = false;
        saveCurrentFrame();
    });

    window.addEventListener('mouseup', () => { isPanning = false; });

    paintCanvas.addEventListener('mouseleave', () => {
        if (isDrawing) { isDrawing = false; saveCurrentFrame(); }
    });

    paintCanvas.addEventListener('mousemove', draw);

    window.addEventListener('mousemove', e => {
        if (isPanning) {
            panX = e.clientX - startPanX;
            panY = e.clientY - startPanY;
            updateView();
        }
    });

    // ── Timeline buttons ────────────────────────────────────────────────────
    btnPrev.addEventListener('click', prevFrame);
    btnNext.addEventListener('click', nextFrame);
    btnAdd.addEventListener('click', addNewFrame);
    btnDuplicate.addEventListener('click', duplicateFrame);
    btnDelete.addEventListener('click', deleteFrame);

    chkOnion.addEventListener('change', drawOnionSkin);

    btnLoadPng.addEventListener('click', () => inputLoadPng.click());
    inputLoadPng.addEventListener('change', e => loadPNG(e));

    btnExport.addEventListener('click', exportPNG);
    btnExportGif.addEventListener('click', exportGif);

    btnAddPaletteRow.onclick = () => createPaletteRow(paleteColorPicker.value);
    createPaletteRow('#553d3d');

    colorWheelToggle.addEventListener('click', () => {
        const isCollapsed = colorWheelBody.classList.toggle('collapsed');
        collapseChevron.textContent = isCollapsed ? 'expand_more' : 'expand_less';
    });

    fpsInput.addEventListener('change', restartPreview);

    // ── Init ────────────────────────────────────────────────────────────────
    initLayers();
    updateUI();
    updateView();
    renderLayerPanel();
    updatePreview();
}

window.addEventListener('load', pageLoad);
