const loginScreen = document.getElementById('login-screen');
const gameScreen = document.getElementById('game-screen');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const hostControls = document.getElementById('host-controls');
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
let drawHistory = []; // Unified history to replay on resize
let myUsername = "";
let myId = "";

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    
    // Set display size (css pixels)
    canvas.style.width = rect.width + 'px';
    canvas.style.height = (rect.height - (toolbar.style.display !== 'none' ? toolbar.offsetHeight : 0)) + 'px';
    
    // Set actual internal resolution
    const newWidth = rect.width * dpr;
    const newHeight = (rect.height - (toolbar.style.display !== 'none' ? toolbar.offsetHeight : 0)) * dpr;
    
    if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        ctx.scale(dpr, dpr);
        
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, rect.width, rect.height);
        
        // REPLAY drawing from history – works perfectly on mobile!
        drawHistory.forEach(payload => drawLineLocalInternal(payload));
    }
}

window.addEventListener('resize', resizeCanvas);

joinBtn.addEventListener('click', () => {
    myUsername = usernameInput.value.trim();
    const room = roomInput.value.trim();
    if (myUsername && room) {
        connectWebSocket(room, myUsername);
    } else {
        alert("Please enter both username and room code.");
    }
});

function connectWebSocket(room, username) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/${room}/${username}`);

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
            // CLEAR local state for new turn
            isMyTurn = false;
            toolbar.style.display = 'none';
            chatInput.disabled = false;
            drawHistory = [];
            clearCanvas();
            overlayMessage.style.display = 'none';

            if (msg.drawer === myId) {
                console.log("TURN ASSIGNED: You are drawing!");
            } else {
                console.log("TURN ASSIGNED: You are guessing!");
            }
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
            console.log("TURN ACTIVATED: You received the word assignment!");
            isMyTurn = true;
            wordDisplay.textContent = msg.word;
            wordDisplay.style.letterSpacing = "5px";
            toolbar.style.display = 'flex';
            chatInput.disabled = true; // drawer can't guess
            resizeCanvas();
            break;
        case 'draw':
            console.log("Drawing received:", msg.data);
            drawHistory.push(msg.data);
            drawLineServer(msg.data);
            break;
        case 'clear':
            drawHistory = [];
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
        if (p.username === myUsername) myId = p.id;
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
    ws.send(JSON.stringify({ type: 'start_game' }));
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
    
    let clientX = e.clientX;
    let clientY = e.clientY;
    
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }
    
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
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
    
    const rect = canvas.getBoundingClientRect();
    const payload = {
        x0: lastPos.x, y0: lastPos.y,
        x1: pos.x, y1: pos.y,
        color: currentSettings.erase ? '#ffffff' : currentSettings.color,
        size: currentSettings.size,
        w: rect.width, h: rect.height
    };
    
    drawLineLocal(payload);
    drawHistory.push(payload);
    ws.send(JSON.stringify({ type: 'draw', data: payload }));
    
    lastPos = pos;
}

function drawLineLocalInternal(data) {
    ctx.beginPath();
    ctx.moveTo(data.x0, data.y0);
    ctx.lineTo(data.x1, data.y1);
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.closePath();
}

function drawLineLocal(data) {
    drawLineLocalInternal(data);
}

function drawLineServer(data) {
    // We scale based on the CSS size (rect) to avoid DPR confusion
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / data.w;
    const scaleY = rect.height / data.h;
    
    const x0 = data.x0 * scaleX;
    const y0 = data.y0 * scaleY;
    const x1 = data.x1 * scaleX;
    const y1 = data.y1 * scaleY;

    console.log(`Rendering from server: (${x0.toFixed(1)}, ${y0.toFixed(1)}) to (${x1.toFixed(1)}, ${y1.toFixed(1)})`);

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
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
