const CANVAS_SIZE = 32; // Resolução nativa (32x32)

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

// Controles
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnAdd = document.getElementById('btnAddFrame');
const btnDuplicate = document.getElementById('btnDuplicateFrame');

const btnExport = document.getElementById('btnExport');
const btnExportGif = document.getElementById('btnExportGif');

const btnPencil = document.getElementById('btnPencil');
const btnEraser = document.getElementById('btnEraser');
const btnBucket = document.getElementById('btnBucket');
const btnClear = document.getElementById('btnClearFrame');

const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');
const fpsInput = document.getElementById('fpsInput');

const paletteRows = document.getElementById('paletteRows');
const mainColorPicker = document.getElementById('mainColorPicker');
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
};

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
    };

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
};

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
};

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
};

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
};

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
}

// --- Funções de Núcleo ---
function updateUI(){
    frameIndicator.innerText = `Frame: ${currentFrameIndex + 1} / ${frames.length}`;
    
    // Habilitar/Desabilitar botões de navegação
    btnPrev.disabled = currentFrameIndex === 0;
    btnNext.disabled = currentFrameIndex === frames.length - 1;
};

// --- Lógica de Troca de Ferramenta ---
function setTool(tool){
    currentTool = tool;
    btnPencil.classList.toggle('active-tool', tool === 'pencil');
    btnEraser.classList.toggle('active-tool', tool === 'eraser');
    btnBucket.classList.toggle('active-tool', tool === 'bucket');
};

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
    };

 function saveCurrentFrame(){
        frames[currentFrameIndex] = paintCanvas.toDataURL();
    };

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
    };

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
    };

    // --- Ações de Navegação e Edição ---

    function nextFrame(){
        if (currentFrameIndex < frames.length - 1) {
            saveCurrentFrame(); // Salva o estado do atual
            loadFrame(currentFrameIndex + 1);
        }
    };

    function prevFrame(){
        if (currentFrameIndex > 0) {
            saveCurrentFrame(); // Salva o estado do atual
            loadFrame(currentFrameIndex - 1);
        }
    };

    function addNewFrame(){
        saveCurrentFrame();
        // Limpa apenas o canvas de desenho
        paintCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        // Adiciona o novo frame vazio ao array
        frames.push(paintCanvas.toDataURL());
        // Vai para o novo frame
        loadFrame(frames.length - 1);
    };

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

    // --- Lógica de Desenho ---

    function draw(e){
        if (!isDrawing) return;
        const pos = getMousePos(e);

        if (currentTool === 'pencil') {
            // Modo Normal: Desenha a cor selecionada
            paintCtx.globalCompositeOperation = 'source-over';
            paintCtx.fillStyle = colorPicker.value;
            paintCtx.fillRect(pos.x, pos.y, 1, 1);
        } else if (currentTool === 'eraser') {
            // Modo Borracha: "Corta" o pixel deixando-o transparente
            paintCtx.globalCompositeOperation = 'destination-out';
            paintCtx.fillRect(pos.x, pos.y, 1, 1);
        }
    };

    function getMousePos(e){
        const rect = paintCanvas.getBoundingClientRect();
        // Mapeia a coordenada do clique (visual) para a coordenada do canvas (32x32)
        return {
            x: Math.floor((e.clientX - rect.left) * (CANVAS_SIZE / rect.width)),
            y: Math.floor((e.clientY - rect.top) * (CANVAS_SIZE / rect.height))
        };
    };

    function restartPreview(){
        clearTimeout(previewTimeout);
        updatePreview();
    };

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
        if (e.key.toLowerCase() === 'b') setTool('bucket');
    });

    // --- Listeners ---
    btnPencil.addEventListener('click', () => setTool('pencil'));
    btnEraser.addEventListener('click', () => setTool('eraser'));
    btnBucket.addEventListener('click', () => setTool('bucket'));

    btnClear.addEventListener('click', clearFrame);

    // Listener para o checkbox
    chkGrid.addEventListener('change', drawGrid);

    // Inicializa a grade
    drawGrid();

   

    paintCanvas.addEventListener('mousedown', (e) => {
        const pos = getMousePos(e);
        
        if (currentTool === 'bucket') {
            const color = hexToRgb(colorPicker.value);
            floodFill(pos.x, pos.y, color);
        } else {
            isDrawing = true;
            draw(e);
        }
    });

    paintCanvas.addEventListener('mouseup', () => {
        if(isDrawing) {
            isDrawing = false;
            saveCurrentFrame(); // Auto-salva ao soltar o mouse
        }
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
    
    // Atualiza a visualização se o usuário ligar/desligar o Onion Skin
    chkOnion.addEventListener('change', drawOnionSkin);

    // --- Exportação (Spritesheet PNG) ---
    btnExport.addEventListener('click', exportPNG);
    btnExportGif.addEventListener('click', exportGif);

    // Adiciona uma cor inicial (ex: cinza ou azul)
    btnAddPaletteRow.onclick = () => {createPaletteRow(mainColorPicker.value);};
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
