// Mude de const para let
var CANVAS_SIZE = 32;
const selectSize = document.getElementById('selectSize');

// Ferramentas
const btnPencil = document.getElementById('btnPencil');

var startX, startY;
var snapshot; // Para guardar o estado do canvas antes de começar a linha
const btnLine = document.getElementById('btnLine');

const btnEraser = document.getElementById('btnEraser');
const btnBucket = document.getElementById('btnBucket');

var selection = { active: false, x: 0, y: 0, w: 0, h: 0, data: null, isMoving: false };
var clipboard = null;
const btnSelect = document.getElementById('btnSelect');

//zoom and panning
var scale = 10.0;
var minscale = 0.5;
var maxscale = 30.0;
var panX = 0;
var panY = 0;
var isPanning = false;
var startPanX, startPanY;
const btn_ZoomIn = document.getElementById('btnZoomIn');
const btn_ZoomOut = document.getElementById('btnZoomOut');
const btnPan = document.getElementById('btnPan');
const btnContour = document.getElementById('btnContour');

const viewPort = document.getElementById("viewport");
const container = document.getElementById('canvasContainer');
const zoomDisplay = document.getElementById('zoomDisplay');


const backGroundCanvas = document.getElementById('backgroundCanvas');
var canvasBackgroundSize = 100 / (CANVAS_SIZE/2);
// Canvas Principal
const paintCanvas = document.getElementById('paintCanvas');
const paintCtx = paintCanvas.getContext('2d');

// Canvas Onion Skin
const onionCanvas = document.getElementById('onionCanvas');
const onionCtx = onionCanvas.getContext('2d');

// UI Elements
const colorPicker = document.getElementById('colorPicker');
const frameIndicator = document.getElementById('frameIndicator');
const chkOnion = document.getElementById('chkOnion');

// Timeline
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnAdd = document.getElementById('btnAddFrame');
const btnDuplicate = document.getElementById('btnDuplicateFrame');
const btnDelete = document.getElementById('btnDeleteFrame');

//Manipulação de arquivos
const btnExport = document.getElementById('btnExport');
const btnExportGif = document.getElementById('btnExportGif');

const btnClear = document.getElementById('btnClearFrame');

const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');
const fpsInput = document.getElementById('fpsInput');

const paletteRows = document.getElementById('paletteRows');
const paleteColorPicker = document.getElementById('paleteColorPicker');
const btnAddPaletteRow = document.getElementById('btnAddPaletteRow');

const gridCanvas = document.getElementById('gridCanvas');
const gridCtx = gridCanvas.getContext('2d');
const chkGrid = document.getElementById('chkGrid');

const inputLoadPng = document.getElementById('inputLoadPng');
const btnLoadPng = document.getElementById('btnLoadPng');

// 'pencil' ou 'eraser'
var currentTool = 'pencil';
// --- Estado da Aplicação ---
var historyStack = [];

function saveStateForUndo() {
    historyStack.push({
        frames: [...frames],
        currentFrameIndex: currentFrameIndex
    });
    if (historyStack.length > 50) historyStack.shift();
}

function undo() {
    if (historyStack.length > 0) {
        const prevState = historyStack.pop();
        frames = prevState.frames;
        currentFrameIndex = prevState.currentFrameIndex;

        const img = new Image();
        img.onload = () => {
            paintCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
            paintCtx.drawImage(img, 0, 0);
            drawOnionSkin();
            updateUI();
            if (typeof restartPreview === 'function') restartPreview();
            selection.active = false;
            if (typeof drawGrid === 'function') drawGrid();
        };
        img.src = frames[currentFrameIndex];
    }
}

// Começamos com um frame vazio (totalmente transparente)
var frames = [paintCanvas.toDataURL()];
var currentFrameIndex = 0;
var isDrawing = false;

var previewFrameIndex = 0;
var previewTimeout = null;

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

    if (max === min) h = s = 0;
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

function createPaletteRow(baseHex) {
    const hsl = hexToHsl(baseHex);
    const row = document.createElement('div');
    row.className = 'palette-row';

    // Tons: -30%, -20%, -10%, BASE, +10%, +20%, +30%
    const offsets = [-30,-25,-20, -15, -10, 0, 10, 15, 20, 25, 30];

    offsets.forEach(offset => {
        const newL = Math.max(0, Math.min(100, hsl.l + offset));
        const hex = hslToHex(hsl.h, hsl.s, newL);

        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = hex;
        swatch.title = hex;

        // Ao clicar, define como a cor principal do editor
        swatch.onclick = () => {
            colorPicker.value = hex;
            // Se estiver no modo borracha, volta para o lápis ao escolher cor
            if (currentTool === 'eraser') setTool('pencil');
        };

        row.appendChild(swatch);
    });

    paletteRows.appendChild(row);
}

function floodFill(startX, startY, fillColor) {
    const imageData = paintCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const pixels = imageData.data;

    const startPos = (startY * CANVAS_SIZE + startX) * 4;
    const startR = pixels[startPos];
    const startG = pixels[startPos + 1];
    const startB = pixels[startPos + 2];
    const startA = pixels[startPos + 3];

    // Cor é considerada igual se a diferença de tom for mínima (lida com antialiasing leve)
    // OU se ambos os pixels forem totalmente transparentes (invisíveis).
    const matchColor = (pos) => {
        const a = pixels[pos + 3];
        if (startA === 0 && a === 0) return true;

        const r = pixels[pos];
        const g = pixels[pos + 1];
        const b = pixels[pos + 2];
        const tolerance = 5;

        return Math.abs(r - startR) <= tolerance &&
            Math.abs(g - startG) <= tolerance &&
            Math.abs(b - startB) <= tolerance &&
            Math.abs(a - startA) <= tolerance;
    };

    if (matchColor(startPos) &&
        Math.abs(fillColor.r - startR) <= 5 &&
        Math.abs(fillColor.g - startG) <= 5 &&
        Math.abs(fillColor.b - startB) <= 5 &&
        Math.abs(fillColor.a - startA) <= 5) {
        return; // É praticamente a mesma cor, aborta.
    }

    // Pinta a origem antes de ir à pilha
    pixels[startPos] = fillColor.r;
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
                    // Pinta o pixel IMEDIATAMENTE antes do push.
                    pixels[pos] = fillColor.r;
                    pixels[pos + 1] = fillColor.g;
                    pixels[pos + 2] = fillColor.b;
                    pixels[pos + 3] = fillColor.a;
                    stack.push([nx, ny]);
                }
            }
        };

        checkAndPush(x - 1, y); // Esquerda
        checkAndPush(x + 1, y); // Direita
        checkAndPush(x, y - 1); // Cima
        checkAndPush(x, y + 1); // Baixo
    }
    paintCtx.putImageData(imageData, 0, 0);
    saveCurrentFrame(); // Atualiza o array de frames e o preview
}

function loadPNG(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
            const h = img.height;
            const w = img.width;

            // 1. Validação de proporção (Orientação)
            if (h > w) {
                alert("Erro: A altura é maior que a largura. O arquivo deve ser uma Spritesheet horizontal (frames lado a lado).");
                return;
            }

            // 2. Validação de tamanho padrão
            // Lista de tamanhos permitidos baseada no seu selectSize
            const tamanhosPadrao = [16, 24, 32, 48, 64, 96, 128, 256, 512];
            if (!tamanhosPadrao.includes(h)) {
                alert(`Erro: A altura da imagem (${h}px) não corresponde a nenhum dos tamanhos padrão do editor: ${tamanhosPadrao.join(', ')}.`);
                return;
            }

            // 3. Validação de múltiplo (Largura deve ser divisível pela altura)
            if (w % h !== 0) {
                alert(`Erro: A largura (${w}px) não é um múltiplo exato da altura (${h}px). Os frames não podem ser cortados perfeitamente.`);
                return;
            }

            // Se passou nas validações, processa os frames
            if (confirm(`Imagem detectada: ${h}x${h} pixels por frame. Isso substituirá seu trabalho atual. Deseja continuar?`)) {
                importSpritesheet(img, h);
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    // Reseta o input para permitir carregar o mesmo arquivo novamente se necessário
    e.target.value = '';
}

function importSpritesheet(img, size) {
    // Ajusta o tamanho do editor para o tamanho detectado
    CANVAS_SIZE = size;
    selectSize.value = size;

    // Limpa os frames atuais
    frames = [];
    currentFrameIndex = 0;
    historyStack = [];

    const numFrames = img.width / size;

    // Canvas temporário para fatiar
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = size;
    tempCanvas.height = size;

    for (let i = 0; i < numFrames; i++) {
        tempCtx.clearRect(0, 0, size, size);
        // Corta o pedaço da imagem original (x = i * size) e desenha no canvas 1:1
        tempCtx.drawImage(img, i * size, 0, size, size, 0, 0, size, size);
        frames.push(tempCanvas.toDataURL());
    }

    // Atualiza a UI e o Canvas principal
    loadFrame(frames.length - 1);
    drawOnionSkin();
    restartPreview();
    alert(`Sucesso! ${numFrames} frames carregados.`);
}

function exportPNG() {
    saveCurrentFrame(); // Garante que o último frame está salvo
    if (frames.length === 0) return;

    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = CANVAS_SIZE * frames.length;
    sheetCanvas.height = CANVAS_SIZE;
    const sCtx = sheetCanvas.getContext('2d');
    sCtx.imageSmoothingEnabled = false;

    let loadedImages = 0;
    frames.forEach((frameData, index) => {
        const img = new Image();
        img.onload = () => {
            sCtx.drawImage(img, index * CANVAS_SIZE, 0);
            loadedImages++;
            if (loadedImages === frames.length) {
                const link = document.createElement('a');
                link.download = `spritesheet_${frames.length}frames.png`;
                link.href = sheetCanvas.toDataURL();
                link.click();
            }
        };
        img.src = frameData;
    });
}

import { GIFEncoder, quantize, applyPalette } from 'https://unpkg.com/gifenc@1.0.3';

async function exportGif() {
    if (frames.length === 0) {
        alert("Adicione pelo menos um frame para exportar!");
        return;
    }

    // Desestruturação dos utilitários da gifenc
    const encoder = GIFEncoder();
    const fps = parseInt(fpsInput.value || 8);
    const delay = 1000 / fps;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = CANVAS_SIZE;
    tempCanvas.height = CANVAS_SIZE;

    console.log("Iniciando exportação de GIF com transparência...");

    for (const frameData of frames) {
        await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // Importante: Limpar com transparência total antes de desenhar o frame
                tempCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
                tempCtx.drawImage(img, 0, 0);
                resolve();
            };
            img.src = frameData;
        });

        const imageData = tempCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        const { data } = imageData;

        // 1. Criar a paleta (máximo 256 cores)
        const palette = quantize(data, 256);

        // 2. Aplicar a paleta para obter os índices dos pixels
        const index = applyPalette(data, palette);

        // 3. Encontrar o índice da cor transparente
        // O gifenc geralmente coloca a transparência no final ou mapeia pixels 0,0,0,0
        // Vamos procurar na paleta o índice que representa o pixel transparente
        let transparentIndex = -1
        for (let i = 0; i < palette.length; i++) {
            let color = palette[i];
            // let r = color[0];
            // let g = color[1];
            // let b = color[2];
            let alpha = color[3];
            if (alpha == 0) transparentIndex = i;
        }

        let containsTransparence = transparentIndex != -1;
        if (transparentIndex == -1) transparentIndex = 0;

        // 4. Escrever o frame com a opção 'transparent' e 'transparentIndex'
        encoder.writeFrame(index, CANVAS_SIZE, CANVAS_SIZE, {
            palette,
            delay,
            transparent: containsTransparence,
            transparentIndex: transparentIndex,
            disposal: 2
        });
    }

    encoder.finish();
    const buffer = encoder.bytes();
    const blob = new Blob([buffer], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'pixel-art-transparente.gif';
    link.click();

    URL.revokeObjectURL(url);
    console.log("GIF Transparente exportado!");
}

/**
 * applyContour — draws a 1-pixel outline around every opaque region
 * using the currently selected color.
 * Works by scanning all pixels; for each transparent pixel, if any
 * orthogonal (4-directional) neighbour is opaque, that pixel is painted.
 * The operation is non-destructive to existing pixels.
 */
function applyContour() {
    saveStateForUndo();

    const imageData = paintCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const src = new Uint8ClampedArray(imageData.data); // immutable snapshot
    const dst = imageData.data;                        // output (we'll write here)

    const fill = hexToRgb(colorPicker.value);

    const idx = (x, y) => (y * CANVAS_SIZE + x) * 4;

    const isOpaque = (x, y) => {
        if (x < 0 || x >= CANVAS_SIZE || y < 0 || y >= CANVAS_SIZE) return false;
        return src[idx(x, y) + 3] > 10; // treat alpha > 10 as "opaque"
    };

    const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (let y = 0; y < CANVAS_SIZE; y++) {
        for (let x = 0; x < CANVAS_SIZE; x++) {
            const i = idx(x, y);
            // Only paint transparent pixels that border an opaque one
            if (src[i + 3] <= 10) {
                const bordersOpaque = neighbors.some(([dx, dy]) => isOpaque(x + dx, y + dy));
                if (bordersOpaque) {
                    dst[i]     = fill.r;
                    dst[i + 1] = fill.g;
                    dst[i + 2] = fill.b;
                    dst[i + 3] = 255;
                }
            }
        }
    }

    paintCtx.putImageData(imageData, 0, 0);
    saveCurrentFrame();
    if (typeof restartPreview === 'function') restartPreview();
}

function drawGrid() {
    gridCtx.clearRect(0, 0, CANVAS_SIZE * scale, CANVAS_SIZE * scale);

    if (scale < 5) return;
    if (!chkGrid.checked) return;

    gridCtx.strokeStyle = "rgba(255, 255, 255, 0.15)"; // Cor da linha (cinza claro translúcido para dark mode)
    gridCtx.lineWidth = 0.5; // Um pouquinho mais espessa para melhorar a visibilidade

    gridCtx.beginPath();
    for (let i = 0; i <= CANVAS_SIZE; i++) {
        // Linhas Verticais
        gridCtx.moveTo(i * scale, 0);
        gridCtx.lineTo(i * scale, CANVAS_SIZE * scale);
        // Linhas Horizontais
        gridCtx.moveTo(0, i * scale);
        gridCtx.lineTo(CANVAS_SIZE * scale, i * scale);
    }
    gridCtx.stroke();

    // Desenha o retângulo de seleção se estiver ativo
    if (currentTool == "select") {
        if (selection.active) {
            gridCtx.strokeStyle = "#ff0000"; // Vermelho para destacar
            gridCtx.lineWidth = 0.5;
            gridCtx.setLineDash([2, 2]); // Linha tracejada
            gridCtx.strokeRect(selection.x * scale, selection.y * scale, selection.w * scale, selection.h * scale);
            gridCtx.setLineDash([]); // Reset dash
        }
    }
}

// --- Funções de Núcleo ---
function updateUI() {
    frameIndicator.innerText = `Frame: ${currentFrameIndex + 1} / ${frames.length}`;

    // Habilitar/Desabilitar botões de navegação
    btnPrev.disabled = currentFrameIndex === 0;
    btnNext.disabled = currentFrameIndex === frames.length - 1;
}

// --- Lógica de Troca de Ferramenta ---
function setTool(tool) {
    currentTool = tool;
    // Remove classe ativa de todos
    btnPencil.classList.remove('active-tool');
    btnEraser.classList.remove('active-tool');
    btnBucket.classList.remove('active-tool');
    btnLine.classList.remove('active-tool');
    btnSelect.classList.remove('active-tool');
    btnPan.classList.remove('active-tool');
    btnContour.classList.remove('active-tool');

    // Adiciona ao selecionado
    if (tool === 'pencil') btnPencil.classList.add('active-tool');
    if (tool === 'eraser') btnEraser.classList.add('active-tool');
    if (tool === 'bucket') btnBucket.classList.add('active-tool');
    if (tool === 'line') btnLine.classList.add('active-tool');
    if (tool === 'pan') btnPan.classList.add('active-tool');

    if (tool === 'select') btnSelect.classList.add('active-tool');
    else {
        selection.active = false;
        selection.data = null;
        selection.isMoving = false;
        drawGrid();
    }
}

function updatePreview() {
    if (frames.length === 0) return;

    // Limpa e desenha o frame atual da animação
    const img = new Image();
    img.onload = () => {
        previewCtx.clearRect(0, 0, 32, 32);
        previewCtx.drawImage(img, 0, 0);

        // Avança para o próximo frame circularmente
        previewFrameIndex = (previewFrameIndex + 1) % frames.length;

        // Calcula o tempo baseado no FPS (1000ms / FPS)
        const delay = 1000 / parseInt(fpsInput.value || 8);

        // Agenda o próximo frame
        previewTimeout = setTimeout(updatePreview, delay);
    };

    // Se estivermos editando o frame que o preview quer mostrar, 
    // pegamos a versão mais atual direto do canvas se necessário,
    // mas usar o array 'frames' costuma ser mais performático.
    img.src = frames[previewFrameIndex];
}

function saveCurrentFrame() {
    frames[currentFrameIndex] = paintCanvas.toDataURL();
}

function drawOnionSkin() {
    onionCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Se a opção estiver desligada ou for o primeiro frame, não desenha nada
    if (!chkOnion.checked || currentFrameIndex === 0) {
        return;
    }

    // Pega o frame anterior
    const prevFrameData = frames[currentFrameIndex - 1];
    const img = new Image();
    img.onload = () => {
        onionCtx.drawImage(img, 0, 0);
    };
    img.src = prevFrameData;
}

function loadFrame(index) {
    currentFrameIndex = index;

    // 1. Carrega o frame atual no canvas de pintura
    const img = new Image();
    img.onload = () => {
        paintCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        paintCtx.drawImage(img, 0, 0);

        // 2. Após carregar o atual, desenha o anterior no fundo
        drawOnionSkin();
        updateUI();
    };
    img.src = frames[index];
}

// --- Ações de Navegação e Edição ---
function updateCanvasResolution(newSize) {
    if (!confirm("Alterar o tamanho irá limpar o seu progresso atual. Continuar?")) {
        selectSize.value = CANVAS_SIZE; // Reverte o dropdown
        return;
    }

    CANVAS_SIZE = parseInt(newSize);

    // Lista de todos os canvas que precisam mudar a resolução interna
    paintCanvas.width = CANVAS_SIZE;
    paintCanvas.height = CANVAS_SIZE;

    backGroundCanvas.style.backgroundSize = `${100 / (CANVAS_SIZE/2)}% ${100 / (CANVAS_SIZE/2)}%`;

    backGroundCanvas.width = CANVAS_SIZE;
    backGroundCanvas.height = CANVAS_SIZE;

    onionCanvas.width = CANVAS_SIZE;
    onionCanvas.height = CANVAS_SIZE;

    previewCanvas.width = CANVAS_SIZE;
    previewCanvas.height = CANVAS_SIZE;

    gridCanvas.width = CANVAS_SIZE * scale;
    gridCanvas.height = CANVAS_SIZE * scale;


    // Reinicia o projeto
    frames = [];
    currentFrameIndex = 0;
    historyStack = [];

    // Cria um novo frame em branco no novo tamanho
    paintCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    saveCurrentFrame();

    loadFrame(0);
    drawGrid();
}
function nextFrame() {
    if (currentFrameIndex < frames.length - 1) {
        saveCurrentFrame(); // Salva o estado do atual
        loadFrame(currentFrameIndex + 1);
    }
}

function prevFrame() {
    if (currentFrameIndex > 0) {
        saveCurrentFrame(); // Salva o estado do atual
        loadFrame(currentFrameIndex - 1);
    }
}

function addNewFrame() {
    saveStateForUndo();
    saveCurrentFrame();
    // Limpa apenas o canvas de desenho
    paintCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    // Adiciona o novo frame vazio ao array
    frames.push(paintCanvas.toDataURL());
    // Vai para o novo frame
    loadFrame(frames.length - 1);
}

function duplicateFrame() {
    saveStateForUndo();
    // 1. Guarda o estado atual do canvas no array
    saveCurrentFrame();

    // 2. Obtém os dados (DataURL) do frame que queremos copiar
    const frameDataParaCopiar = frames[currentFrameIndex];

    // 3. Insere a cópia no array logo após o frame atual
    // O método splice(índice, quantos_remover, item) é ideal para inserções
    frames.splice(currentFrameIndex + 1, 0, frameDataParaCopiar);

    // 4. Carrega o novo frame duplicado
    loadFrame(currentFrameIndex + 1);
}

function deleteFrame() {
    // 1. Regra de segurança: Sempre deve haver pelo menos um frame
    if (frames.length <= 1) {
        alert("Não é possível excluir o único frame da animação.");
        return;
    }

    saveStateForUndo();

    // 2. Confirmação para evitar cliques acidentais
    // if (confirm(`Deseja realmente excluir o frame ${currentFrameIndex + 1}?`)) {
    // Remove o frame do array
    frames.splice(currentFrameIndex, 1);

    // 3. Ajuste de índice: 
    // Se deletarmos o último frame, voltamos para o novo "último"
    if (currentFrameIndex >= frames.length) {
        currentFrameIndex = frames.length - 1;
    }

    // 4. Recarrega a UI com o novo estado
    loadFrame(currentFrameIndex);

    // Opcional: Reinicia o preview para atualizar a duração da animação
    if (typeof restartPreview === 'function') restartPreview();
    // }
}

// --- Lógica de Desenho ---

function draw(e) {
    if (!isDrawing) return;
    const { x, y } = getMousePos(e);
    if (currentTool === 'select') {
        if (selection.isMoving) {
            // Move a caixa de seleção
            const dx = x - startX;
            const dy = y - startY;
            selection.x += dx;
            selection.y += dy;
            startX = x;
            startY = y;
        } else {
            // Cria a caixa de seleção
            const rect = getSelectionPath(startX, startY, x, y);
            selection = { ...selection, ...rect, active: true };
        }
        drawGrid(); // Redesenha a grade para mostrar o retângulo de seleção
    }
    if (currentTool === 'pencil') {
        paintCtx.fillStyle = colorPicker.value;
        paintCtx.fillRect(x, y, 1, 1);
    } else if (currentTool === 'eraser') {
        paintCtx.clearRect(x, y, 1, 1);
    } else if (currentTool === 'line') {
        // Restaura o canvas antes de desenhar a nova linha de preview
        paintCtx.putImageData(snapshot, 0, 0);
        drawPixelLine(startX, startY, x, y, colorPicker.value, false);
    }
}

function getMousePos(e) {
    const rect = paintCanvas.getBoundingClientRect();
    // Mapeia a coordenada do clique (visual) para a coordenada do canvas (32x32)
    return {
        x: Math.floor((e.clientX - rect.left) * (CANVAS_SIZE / rect.width)),
        y: Math.floor((e.clientY - rect.top) * (CANVAS_SIZE / rect.height))
    };
}

function restartPreview() {
    clearTimeout(previewTimeout);
    updatePreview();
}

function drawPixelLine(x0, y0, x1, y1, color, isEraser = false) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = (x0 < x1) ? 1 : -1;
    let sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    paintCtx.fillStyle = color;

    while (true) {
        if (isEraser) {
            paintCtx.clearRect(x0, y0, 1, 1);
        } else {
            paintCtx.fillRect(x0, y0, 1, 1);
        }

        if (x0 === x1 && y0 === y1) break;
        let e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
}

function getSelectionPath(x1, y1, x2, y2) {
    return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1) + 1,
        h: Math.abs(y2 - y1) + 1
    };
}

function isPointInSelection(x, y) {
    return selection.active &&
        x >= selection.x && x < selection.x + selection.w &&
        y >= selection.y && y < selection.y + selection.h;
}

function clearFrame() {
    saveStateForUndo();
    // Limpa o contexto de desenho
    paintCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    // Atualiza o array de frames e o preview
    saveCurrentFrame();
    // Se houver um frame posterior, o onion skin dele precisará de ser atualizado
    // (Isso acontece automaticamente ao navegar entre frames no seu sistema atual)
}

function updateView() {
    // Aplica o zoom e o deslocamento via CSS
    container.style.transform = `translate(${panX}px, ${panY}px)`;
    gridCanvas.width = CANVAS_SIZE * scale;
    gridCanvas.height = CANVAS_SIZE * scale;
    container.style.width = CANVAS_SIZE * scale + "px";
    container.style.height = CANVAS_SIZE * scale + "px";
    zoomDisplay.innerText = `${Math.round(scale * 100)}%`;
    drawGrid();
}

function zoomWheel(e) {
    // 1. Impede que a página inteira role para cima/baixo
    e.preventDefault();

    // 2. Define a sensibilidade do zoom (0.1 = 10% por "click" do scroll)
    const zoomSpeed = 0.5;
    const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
    const oldScale = scale;

    console.log("delta:" + delta);

    // 3. Calcula o novo zoom respeitando os limites (0.5 a 10.0)
    let newScale = scale + delta;
    if (newScale < minscale) newScale = minscale;
    if (newScale > maxscale) newScale = maxscale;

    // Só reprocessa se o zoom realmente mudou
    if (newScale !== oldScale) {
        // --- LÓGICA DE ZOOM NO CURSOR ---
        // Pegamos a posição do mouse em relação ao viewport
        const rect = viewPort.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculamos onde o mouse está "pisando" no desenho antes do zoom
        const pointX = (mouseX - panX) / oldScale;
        const pointY = (mouseY - panY) / oldScale;

        console.log("scale:" + scale);
        // Atualizamos a escala
        scale = newScale;

        // Ajustamos o Pan para que o ponto calculado continue sob o mouse
        panX = mouseX - (pointX * scale);
        panY = mouseY - (pointY * scale);

        console.log("scale: " + scale);
        console.log("mouse: " + mouseX + " " + mouseY);
        console.log("point: " + pointX + " " + pointY);
        console.log("pan: " + panX + " " + panY);

        updateView();
    }
}

function adjustZoom(delta) {
    let newScale = scale + delta;
    if (newScale < minscale) newScale = minscale;
    if (newScale > maxscale) newScale = maxscale;

    scale = newScale;
    updateView();
}

function adjustViewPort() {
    viewPort.style.width = window.innerWidth + "px";
    viewPort.style.height = window.innerHeight + "px";
    panX = 0;
    panY = 0;
    updateView();
}

function syncColorPickers(e) {
    let color = e.target.value;
    colorPicker.value = color;
    paleteColorPicker.value = color;
}

function pageLoad() {

    viewPort.style.width = (window.innerWidth - 40) + "px";
    viewPort.style.height = (window.innerHeight - 100) + "px";

    window.onresize = () => adjustViewPort();

    // Configuração para Pixel Art em ambos os contextos
    paintCtx.imageSmoothingEnabled = false;
    onionCtx.imageSmoothingEnabled = false;
    // Configuração do Preview
    previewCtx.imageSmoothingEnabled = false;

    selectSize.addEventListener('change', (e) => updateCanvasResolution(e.target.value));

    // --- Atalhos de Teclado (Opcional, mas muito útil) ---
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'p') setTool('pencil');
        if (e.key.toLowerCase() === 'e') setTool('eraser');
        if (e.key.toLowerCase() === 'l') setTool('line');
        if (e.key.toLowerCase() === 'b') setTool('bucket');
        if (e.key.toLowerCase() === 's') setTool('select');
        if (e.key.toLowerCase() === 'o') {
            // 'O' = one-shot contour: flash active state then revert
            const prev = currentTool;
            btnContour.classList.add('active-tool');
            applyContour();
            setTimeout(() => {
                btnContour.classList.remove('active-tool');
            }, 300);
        }

        if (e.code === 'Space') {
            setTool('pan');
            document.getElementById('viewport').classList.add('pan-tool-active');
        }

        // Desfazer
        if (e.ctrlKey && e.key.toLowerCase() === 'z') {
            undo();
        }

        // Copiar
        if (e.ctrlKey && e.key === 'c' && selection.active) {
            clipboard = paintCtx.getImageData(selection.x, selection.y, selection.w, selection.h);
            console.log("Copiado!");
        }

        // Colar
        if (e.ctrlKey && e.key === 'v' && clipboard) {
            saveStateForUndo();
            // Cola no topo esquerdo ou na posição atual do mouse
            paintCtx.putImageData(clipboard, selection.x, selection.y);
            saveCurrentFrame();
            console.log("Colado!");
        }
    });

    // --- Listeners ---
    btnPencil.onclick = () => setTool('pencil');
    btnEraser.onclick = () => setTool('eraser');
    btnBucket.onclick = () => setTool('bucket');
    btnLine.onclick = () => setTool('line');
    btnSelect.onclick = () => setTool('select');
    btn_ZoomIn.onclick = () => adjustZoom(0.5);
    btn_ZoomOut.onclick = () => adjustZoom(-0.5);

    btnPan.onclick = () => setTool('pan');

    // Contour is a one-shot action: flash button active, apply, restore
    btnContour.onclick = () => {
        btnContour.classList.add('active-tool');
        applyContour();
        setTimeout(() => btnContour.classList.remove('active-tool'), 300);
    };
    //posição inicial do canvas quando a pagina carregar
    panX = (window.innerWidth - (CANVAS_SIZE * scale)) / 2;
    panY = 20;

    colorPicker.onchange = (e) => syncColorPickers(e);
    paleteColorPicker.onchange = (e) => syncColorPickers(e);

    viewPort.addEventListener('wheel', (e) => zoomWheel(e), { passive: false }); // 'passive: false' é obrigatório para permitir o preventDefault()

    btnClear.addEventListener('click', clearFrame);

    // Listener para o checkbox
    chkGrid.addEventListener('change', drawGrid);

    // Inicializa a grade
    drawGrid();

    backGroundCanvas.style.backgroundSize = `${100 / (CANVAS_SIZE/2)}% ${100 / (CANVAS_SIZE/2)}%`;

    paintCanvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const { x, y } = getMousePos(e);
        const pos = getMousePos(e);
        startX = pos.x;
        startY = pos.y;

        if (currentTool === 'pan') {
            isPanning = true;
            startPanX = e.clientX - panX;
            startPanY = e.clientY - panY;
            return; // Não desenha se estiver movendo a tela
        }

        saveStateForUndo();

        if (currentTool === 'select') {
            if (isPointInSelection(x, y)) {
                // Inicia movimento do que está selecionado
                selection.isMoving = true;
                if (!selection.data) {
                    selection.data = paintCtx.getImageData(selection.x, selection.y, selection.w, selection.h);
                    paintCtx.clearRect(selection.x, selection.y, selection.w, selection.h);
                }
            } else {
                // Inicia nova seleção
                selection.active = false;
                selection.data = null;
                selection.isMoving = false;
            }
        }
        else if (currentTool === 'bucket') {
            floodFill(startX, startY, hexToRgb(colorPicker.value));
        }
        else if (currentTool === 'line') {
            // Guarda o estado atual para o "preview"
            snapshot = paintCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
            draw(e);
        }
        else {
            draw(e);
        }
    });

    paintCanvas.addEventListener('mouseup', () => {
        if (isDrawing && currentTool === 'select' && selection.isMoving) {
            // "Cola" os pixels na nova posição ao soltar
            if (selection.data) {
                paintCtx.putImageData(selection.data, selection.x, selection.y);
                selection.data = null;
                selection.isMoving = false;
            }
        }
        isDrawing = false;
        saveCurrentFrame();
    });
    window.addEventListener('mouseup', () => {
        isPanning = false;
    });

    paintCanvas.addEventListener('mouseleave', () => {
        if (isDrawing) {
            isDrawing = false;
            saveCurrentFrame();
        }
    });

    paintCanvas.addEventListener('mousemove', draw);
    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            panX = e.clientX - startPanX;
            panY = e.clientY - startPanY;
            updateView();
        }
    });

    // --- Listeners da UI ---
    btnPrev.addEventListener('click', prevFrame);
    btnNext.addEventListener('click', nextFrame);
    btnAdd.addEventListener('click', addNewFrame);
    btnDuplicate.addEventListener('click', duplicateFrame);
    btnDelete.addEventListener('click', deleteFrame);

    // Atualiza a visualização se o usuário ligar/desligar o Onion Skin
    chkOnion.addEventListener('change', drawOnionSkin);

    // --- importação (falta testar) ---
    btnLoadPng.addEventListener('click', () => inputLoadPng.click());
    inputLoadPng.addEventListener('change', (e) => loadPNG(e));



    // --- Exportação (Spritesheet PNG) ---
    btnExport.addEventListener('click', exportPNG);
    btnExportGif.addEventListener('click', exportGif);

    // Adiciona uma cor inicial (ex: cinza ou azul)
    btnAddPaletteRow.onclick = () => { createPaletteRow(paleteColorPicker.value); };
    createPaletteRow('#553d3d');
    // --- Lógica da Animação de Preview ---



    // Função para resetar o loop se o FPS mudar ou frames forem adicionados

    // --- Listeners ---
    fpsInput.addEventListener('change', restartPreview);

    // --- Inicialização ---
    updateUI();
    updateView();
    updatePreview(); // Inicia o loop de animação
}

window.addEventListener('load', pageLoad);


