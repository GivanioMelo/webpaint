const CANVAS_SIZE = 32; // Resolução nativa (32x32)

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



 // 'pencil' ou 'eraser'
var currentTool = 'pencil';
// --- Estado da Aplicação ---
// Começamos com um frame vazio (totalmente transparente)
var frames = [paintCanvas.toDataURL()]; 
var currentFrameIndex = 0;
var isDrawing = false;

var previewFrameIndex = 0;
var previewTimeout = null;

function hexToRgb(hex)
{
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b, a: 255 };
}

function hexToHsl(hex){
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

function hslToHex(h, s, l)
{
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function createPaletteRow(baseHex)
{
    const hsl = hexToHsl(baseHex);
    const row = document.createElement('div');
    row.className = 'palette-row';

    // Tons: -30%, -20%, -10%, BASE, +10%, +20%, +30%
    const offsets = [-30, -20, -10, 0, 10, 20, 30];

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
            if(currentTool === 'eraser') setTool('pencil');
        };
        
        row.appendChild(swatch);
    });

    paletteRows.appendChild(row);
}

function floodFill(startX, startY, fillColor)
{
    const imageData = paintCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const pixels = imageData.data;

    // Obtém a cor do pixel onde o usuário clicou
    const startPos = (startY * CANVAS_SIZE + startX) * 4;
    const startR = pixels[startPos];
    const startG = pixels[startPos + 1];
    const startB = pixels[startPos + 2];
    const startA = pixels[startPos + 3];

    // Se a cor de preenchimento for igual à cor inicial, cancela para evitar loop infinito
    if (startR === fillColor.r && startG === fillColor.g && 
        startB === fillColor.b && startA === fillColor.a) return;

    const stack = [[startX, startY]];

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const pos = (y * CANVAS_SIZE + x) * 4;

        // Verifica se o pixel atual tem a mesma cor do ponto inicial
        if (pixels[pos] === startR && pixels[pos+1] === startG && 
            pixels[pos+2] === startB && pixels[pos+3] === startA) {
            
            // Pinta o pixel
            pixels[pos] = fillColor.r;
            pixels[pos+1] = fillColor.g;
            pixels[pos+2] = fillColor.b;
            pixels[pos+3] = fillColor.a;

            // Adiciona vizinhos à pilha (Cima, Baixo, Esquerda, Direita)
            if (x > 0) stack.push([x - 1, y]);
            if (x < CANVAS_SIZE - 1) stack.push([x + 1, y]);
            if (y > 0) stack.push([x, y - 1]);
            if (y < CANVAS_SIZE - 1) stack.push([x, y + 1]);
        }
    }
    paintCtx.putImageData(imageData, 0, 0);
    saveCurrentFrame(); // Atualiza o array de frames e o preview
}

function exportPNG()
{
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

function exportGif()
{
    if (frames.length === 0) return alert("Adicione frames para criar um GIF!");

    // 1. Criar a instância do GIF
    // O workerScript deve apontar para o local do arquivo gif.worker.js
    const gif = new GIF({
        workers: 2,
        quality: 1, // Melhor qualidade para Pixel Art
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
    });

    const delay = 1000 / parseInt(fpsInput.value || 8);
    let loadedCount = 0;

    // 2. Carregar cada frame para o objeto GIF
    frames.forEach((frameData, index) => {
        const img = new Image();
        img.onload = () => {
            // Adiciona o frame com o atraso calculado pelo FPS
            gif.addFrame(img, { delay: delay });
            loadedCount++;

            // 3. Quando todos os frames carregarem, renderizar
            if (loadedCount === frames.length) {
                btnExportGif.innerText = "Renderizando...";
                gif.render();
            }
        };
        img.src = frameData;
    });

    // 4. O que fazer quando o GIF estiver pronto
    gif.on('finished', (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `animacao_${Date.now()}.gif`;
        link.click();
        
        btnExportGif.innerText = "Exportar GIF";
        alert("GIF gerado com sucesso!");
    });
}

function drawGrid() {
    gridCtx.clearRect(0, 0, CANVAS_SIZE*10, CANVAS_SIZE*10);
    
    if (!chkGrid.checked)
    {
        return;
    }

    gridCtx.strokeStyle = "rgba(0, 0, 0, 1)"; // Cor da linha
    gridCtx.lineWidth = 0.3; // Linha bem fina para a escala 32x32

    gridCtx.beginPath();
    for (let i = 0; i <= CANVAS_SIZE; i++) {
        // Linhas Verticais
        gridCtx.moveTo(i*10, 0);
        gridCtx.lineTo(i*10, CANVAS_SIZE*10);
        // Linhas Horizontais
        gridCtx.moveTo(0, i*10);
        gridCtx.lineTo(CANVAS_SIZE*10, i*10);
    }
    gridCtx.stroke();

    // Desenha o retângulo de seleção se estiver ativo
    if (selection.active) {
        gridCtx.strokeStyle = "#ff0000"; // Vermelho para destacar
        gridCtx.lineWidth = 0.5;
        gridCtx.setLineDash([2, 2]); // Linha tracejada
        gridCtx.strokeRect(selection.x*10, selection.y*10, selection.w*10, selection.h*10);
        gridCtx.setLineDash([]); // Reset dash
    }
}

// --- Funções de Núcleo ---
function updateUI(){
    frameIndicator.innerText = `Frame: ${currentFrameIndex + 1} / ${frames.length}`;
    
    // Habilitar/Desabilitar botões de navegação
    btnPrev.disabled = currentFrameIndex === 0;
    btnNext.disabled = currentFrameIndex === frames.length - 1;
}

// --- Lógica de Troca de Ferramenta ---
function setTool(tool) {
    currentTool = tool;
    // Remove classe ativa de todos
    [btnPencil, btnEraser, btnBucket, btnLine].forEach(b => b?.classList.remove('active-tool'));
    
    // Adiciona ao selecionado
    if(tool === 'pencil') btnPencil.classList.add('active-tool');
    if(tool === 'eraser') btnEraser.classList.add('active-tool');
    if(tool === 'bucket') btnBucket.classList.add('active-tool');
    if(tool === 'line') btnLine.classList.add('active-tool');
}

function updatePreview(){
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

 function saveCurrentFrame(){
        frames[currentFrameIndex] = paintCanvas.toDataURL();
    }

    function drawOnionSkin(){
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

    function loadFrame(index){
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

    function nextFrame(){
        if (currentFrameIndex < frames.length - 1) {
            saveCurrentFrame(); // Salva o estado do atual
            loadFrame(currentFrameIndex + 1);
        }
    }

    function prevFrame(){
        if (currentFrameIndex > 0) {
            saveCurrentFrame(); // Salva o estado do atual
            loadFrame(currentFrameIndex - 1);
        }
    }

    function addNewFrame(){
        saveCurrentFrame();
        // Limpa apenas o canvas de desenho
        paintCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        // Adiciona o novo frame vazio ao array
        frames.push(paintCanvas.toDataURL());
        // Vai para o novo frame
        loadFrame(frames.length - 1);
    }

function duplicateFrame() {
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

    function getMousePos(e){
        const rect = paintCanvas.getBoundingClientRect();
        // Mapeia a coordenada do clique (visual) para a coordenada do canvas (32x32)
        return {
            x: Math.floor((e.clientX - rect.left) * (CANVAS_SIZE / rect.width)),
            y: Math.floor((e.clientY - rect.top) * (CANVAS_SIZE / rect.height))
        };
    }

    function restartPreview(){
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
        // Limpa o contexto de desenho
        paintCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        // Atualiza o array de frames e o preview
        saveCurrentFrame();
        // Se houver um frame posterior, o onion skin dele precisará de ser atualizado
        // (Isso acontece automaticamente ao navegar entre frames no seu sistema atual)
}

function pageLoad() {

    // Configuração para Pixel Art em ambos os contextos
    paintCtx.imageSmoothingEnabled = false;
    onionCtx.imageSmoothingEnabled = false;
    // Configuração do Preview
    previewCtx.imageSmoothingEnabled = false;

    // --- Atalhos de Teclado (Opcional, mas muito útil) ---
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'p') setTool('pencil');
        if (e.key.toLowerCase() === 'e') setTool('eraser');
        if (e.key.toLowerCase() === 'l') setTool('line');
        if (e.key.toLowerCase() === 'b') setTool('bucket');
        if (e.key.toLowerCase() === 's') setTool('select');
    
        // Copiar
        if (e.ctrlKey && e.key === 'c' && selection.active) {
            clipboard = paintCtx.getImageData(selection.x, selection.y, selection.w, selection.h);
            console.log("Copiado!");
        }

        // Colar
        if (e.ctrlKey && e.key === 'v' && clipboard) {
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
    btnSelect.onclick=()=> setTool('select');

    btnClear.addEventListener('click', clearFrame);

    // Listener para o checkbox
    chkGrid.addEventListener('change', drawGrid);

    // Inicializa a grade
    drawGrid();

   

    paintCanvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const { x, y } = getMousePos(e);
        const pos = getMousePos(e);
        startX = pos.x;
        startY = pos.y;

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

    paintCanvas.addEventListener('mouseleave', () => {
        if(isDrawing) {
            isDrawing = false;
            saveCurrentFrame();
        }
    });

    paintCanvas.addEventListener('mousemove', draw);
    // paintCanvas.addEventListener('mousedown', (e) => {
    //     isDrawing = true;
    //     draw(e); 
    // });

    // --- Listeners da UI ---
    btnPrev.addEventListener('click', prevFrame);
    btnNext.addEventListener('click', nextFrame);
    btnAdd.addEventListener('click', addNewFrame);
    btnDuplicate.addEventListener('click', duplicateFrame);
    btnDelete.addEventListener('click', deleteFrame);
    
    // Atualiza a visualização se o usuário ligar/desligar o Onion Skin
    chkOnion.addEventListener('change', drawOnionSkin);

    // --- Exportação (Spritesheet PNG) ---
    btnExport.addEventListener('click', exportPNG);
    btnExportGif.addEventListener('click', exportGif);

    // Adiciona uma cor inicial (ex: cinza ou azul)
    btnAddPaletteRow.onclick = () => {createPaletteRow(paleteColorPicker.value);};
    createPaletteRow('#808080');
    // --- Lógica da Animação de Preview ---

    

    // Função para resetar o loop se o FPS mudar ou frames forem adicionados

    // --- Listeners ---
    fpsInput.addEventListener('change', restartPreview);

    // --- Inicialização ---
    updateUI();
    updatePreview(); // Inicia o loop de animação
}

window.addEventListener('load', pageLoad);
