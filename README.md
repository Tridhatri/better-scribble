# 🖌️ Better Scribble - Multiplayer Drawing Game

A high-performance, mobile-responsive multiplayer drawing and guessing game built with **FastAPI** and **WebSockets**. Think Scribble.io, but smoother and optimized for every device.

---

## 🚀 Quick Start

### 1. Setup Environment
```bash
# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Run Locally
```bash
python run.py
```
*Access the game at: `http://localhost:8000`*

### 3. Play with Friends (Ngrok)
If you want to play remotely, expose your local port:
```bash
ngrok http 8000
```

---

## ✨ Features

- **🏆 Real-Time Multiplayer:** Instant synchronization across all players using efficient WebSocket broadcasting.
- **📱 Mobile-First Design:** 
    - **High-DPI Support:** Optimized for Retina displays using `devicePixelRatio` scaling.
    - **Responsive Layout:** Word displays and toolbars stay fixed for a seamless drawing experience on small screens.
    - **Replay History:** The canvas automatically replays drawings if the device rotates or the layout shifts, preventing content loss.
- **👻 Ghost Buster Logic:** Intelligent session persistence—refreshing your browser doesn't lose your turn or create duplicate players.
- **⚡ Zero-Lag Architecture:** Minimized serialization overhead and optimized networking loops for near-instant stroke delivery.

---

## 🏗️ Project Structure

The project is built with a modular backend for scalability:

- **`run.py`**: The main entry point that initializes the FastAPI server and routes.
- **`app/models.py`**: Contains the core blueprints for `Room` and `Player` logic, and the unified word pool.
- **`app/manager.py`**: The engine of the game—handles WebSocket handshakes, broadcasting, and session management.
- **`static/`**: The frontend heart.
    - `app.js`: High-DPI canvas engine and real-time state management.
    - `style.css`: Modern, mobile-responsive design system.
    - `index.html`: The game interface.

---

## 🛠️ Built With
- **FastAPI** (Backend Framework)
- **WebSockets** (Real-time Communication)
- **Vanilla JS/CSS3** (Frontend Engine)
- **Uvicorn** (ASGI Server)

---

## 📝 Developer Note
This project was built from scratch in exactly 3 hours between 12 AM and 3 AM. It focuses on solving the most common issues in real-time web gaming: DPI scaling, state persistence across refreshes, and network-level performance.

**Hit me up if you want to play a round tonight! :)**
