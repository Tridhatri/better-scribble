const loginScreen = document.getElementById('login-screen');
const gameScreen = document.getElementById('game-screen');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const hostControls = document.getElementById('host-controls');
const difficultySelect = document.getElementById('difficulty-select');

const playersList = document.getElementById('players-list');
const startBtn = document.getElementById('start-btn');
const wordDisplay = document.getElementById('word-display');
const roomCodeDisplay = document.getElementById('room-code-display');
const overlayMessage = document.getElementById('overlay-message');

const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const toolbar = document.getElementById('toolbar');
const colorPicker = document.getElementById('color-picker');
const sizePicker = document.getElementById('size-picker');
const eraseBtn = document.getElementById('erase-btn');
const clearBtn = document.getElementById('clear-btn');

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

let ws;
let isDrawing = false;
let isMyTurn = false;
let currentSettings = { color: '#000000', size: 5, erase: false };
let lastPos = { x: 0, y: 0 };
let myUsername = "";

function resizeCanvas() {
    // Preserve content when resizing
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height - (toolbar.style.display !== 'none' ? toolbar.offsetHeight : 0);
    // Draw back
    ctx.putImageData(imgData, 0, 0);
    
    // Set white background initially if empty
    ctx.fillStyle = "white";
    ctx.globalCompositeOperation = "destination-under";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
}

window.addEventListener('resize', resizeCanvas);

joinBtn.addEventListener('click', () => {
    myUsername = usernameInput.value.trim();
    const room = roomInput.value.trim();
    if (myUsername && room) {
        connectWebSocket(room, myUsername, 2); // Default difficulty 2 in join URL
    } else {
        alert("Please enter both username and room code.");
    }
});

function connectWebSocket(room, username, difficulty) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/${room}/${username}/${difficulty}`);

    ws.onopen = () => {
        loginScreen.classList.remove('active');
        gameScreen.classList.add('active');
        roomCodeDisplay.textContent = `Room: ${room}`;
        
        // Timeout to ensure DOM is ready for canvas resize
        setTimeout(resizeCanvas, 100);
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };

    ws.onclose = () => {
        alert("Connection lost. Please refresh.");
        location.reload();
    };
}

function handleMessage(msg) {
    switch(msg.type) {
        case 'players':
            updatePlayersList(msg.data);
            break;
        case 'system_chat':
            addChatMessage(msg.data, 'system');
            break;
        case 'chat':
            addChatMessage(`${msg.username}: ${msg.message}`, 'user');
            if (msg.message.includes("guessed the word")) {
                addChatMessage(msg.message, 'success');
            }
            break;
        case 'game_started':
            // we figure out if it's us later but definitely hide stuff
            isMyTurn = false;
            overlayMessage.style.display = 'none';
            if (msg.word_length) {
                wordDisplay.textContent = "_ ".repeat(msg.word_length).trim();
                wordDisplay.style.letterSpacing = "10px";
            }
            startBtn.style.display = 'none';
            toolbar.style.display = 'none';
            chatInput.disabled = false;
            resizeCanvas();
            break;
        case 'word_assignment':
            isMyTurn = true;
            wordDisplay.textContent = msg.word;
            wordDisplay.style.letterSpacing = "5px";
            toolbar.style.display = 'flex';
            chatInput.disabled = true; // drawer can't guess
            resizeCanvas();
            break;
        case 'draw':
            console.log("Drawing received:", msg.data);
            drawLineServer(msg.data);
            break;
        case 'clear':
            clearCanvas();
            break;
    }
}

function updatePlayersList(players) {
    playersList.innerHTML = '';
    let host = players[0];
    
    // Host is the first player who joined
    if (host && host.username === myUsername && overlayMessage.style.display !== 'none') {
        hostControls.style.display = 'block';
    } else {
        hostControls.style.display = 'none';
    }
    
    players.forEach(p => {
        const li = document.createElement('li');
        li.textContent = `${p.username}: ${p.score}`;
        playersList.appendChild(li);
    });
}

function addChatMessage(text, type) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

startBtn.addEventListener('click', () => {
    const difficulty = parseInt(difficultySelect.value);
    ws.send(JSON.stringify({ type: 'start_game', difficulty: difficulty }));
});

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = chatInput.value.trim();
    if (val && !isMyTurn) {
        ws.send(JSON.stringify({ type: 'chat', message: val }));
        chatInput.value = '';
    }
});

// Canvas Drawing Logic
function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX = e.clientX;
    let clientY = e.clientY;
    
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }
    
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function startDrawing(e) {
    if (!isMyTurn) return;
    isDrawing = true;
    lastPos = getMousePos(e);
}

function stopDrawing() {
    if (!isMyTurn) return;
    isDrawing = false;
}

function draw(e) {
    if (!isDrawing || !isMyTurn) return;
    e.preventDefault();
    
    const pos = getMousePos(e);
    
    const payload = {
        x0: lastPos.x, y0: lastPos.y,
        x1: pos.x, y1: pos.y,
        color: currentSettings.erase ? '#ffffff' : currentSettings.color,
        size: currentSettings.size,
        w: canvas.width, h: canvas.height
    };
    
    drawLineLocal(payload);
    console.log("Sending drawing:", payload);
    ws.send(JSON.stringify({ type: 'draw', data: payload }));
    
    lastPos = pos;
}

function drawLineLocal(data) {
    ctx.beginPath();
    ctx.moveTo(data.x0, data.y0);
    ctx.lineTo(data.x1, data.y1);
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.closePath();
}

function drawLineServer(data) {
    const scaleX = canvas.width / data.w;
    const scaleY = canvas.height / data.h;
    
    ctx.beginPath();
    ctx.moveTo(data.x0 * scaleX, data.y0 * scaleY);
    ctx.lineTo(data.x1 * scaleX, data.y1 * scaleY);
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.closePath();
}

function clearCanvas() {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

canvas.addEventListener('touchstart', startDrawing, {passive: false});
canvas.addEventListener('touchmove', draw, {passive: false});
canvas.addEventListener('touchend', stopDrawing);

colorPicker.addEventListener('change', (e) => {
    currentSettings.color = e.target.value;
    currentSettings.erase = false;
});
sizePicker.addEventListener('change', (e) => {
    currentSettings.size = e.target.value;
});
eraseBtn.addEventListener('click', () => {
    currentSettings.erase = true;
});
clearBtn.addEventListener('click', () => {
    if(isMyTurn) {
        ws.send(JSON.stringify({ type: 'clear' }));
        clearCanvas();
    }
});
