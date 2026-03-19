from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import asyncio
import json
import random
from typing import Dict, List, Set, Tuple, Optional
import os

app = FastAPI()

# Make sure static directory exists
os.makedirs("static", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def get_index():
    return FileResponse("static/index.html")

WORDS = [
    "apple", "banana", "cat", "dog", "elephant", "fish", "grape", "house", "icecream",
    "juice", "kite", "lion", "monkey", "ninja", "orange", "penguin", "queen", "robot",
    "snake", "train", "umbrella", "volcano", "watermelon", "xylophone", "yoyo", "zebra",
    "computer", "smartphone", "bicycle", "car", "airplane", "spaceship", "alien", "ghost",
    "vampire", "zombie", "wizard", "dragon", "knight", "castle", "sword", "shield", "bow",
    "arrow", "magic", "potion", "book", "pen", "pencil", "paper", "notebook", "desk",
    "chair", "table", "bed", "couch", "television", "radio", "guitar", "piano"
]

class Player:
    websocket: WebSocket
    username: str
    score: int
    id: str

    def __init__(self, websocket: WebSocket, username: str):
        self.websocket = websocket
        self.username = username
        self.score = 0
        self.id = str(id(websocket))

class Room:
    room_id: str
    players: List[Player]
    drawer_index: int
    current_word: str
    is_playing: bool
    history: List[dict]
    guessed_correctly: Set[str]

    def __init__(self, room_id: str):
        self.room_id = room_id
        self.players = []
        self.drawer_index = -1
        self.current_word = ""
        self.is_playing = False
        self.history = []
        self.guessed_correctly = set()

    def add_player(self, player: Player):
        self.players.append(player)

    def remove_player(self, websocket: WebSocket):
        self.players = [p for p in self.players if p.websocket != websocket]

    def get_player(self, websocket: WebSocket):
        for p in self.players:
            if p.websocket == websocket:
                return p
        return None

    def start_game(self):
        if len(self.players) < 2:
            return False
        self.is_playing = True
        self.start_turn()
        return True
        
    def next_turn(self):
        if len(self.players) == 0:
            return
        self.drawer_index = (self.drawer_index + 1) % len(self.players)
        self.start_turn()

    def start_turn(self):
        self.current_word = random.choice(WORDS)
        self.history = []
        self.guessed_correctly = set()

rooms: Dict[str, Room] = {}

class ConnectionManager:
    async def connect(self, websocket: WebSocket, room_id: str, username: str) -> Tuple[Room, Player]:
        await websocket.accept()
        if room_id not in rooms:
            rooms[room_id] = Room(room_id)
        room = rooms[room_id]
        player = Player(websocket, username)
        room.add_player(player)
        return room, player

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in rooms:
            room = rooms[room_id]
            player = room.get_player(websocket)
            if player:
                room.remove_player(websocket)
            if len(room.players) == 0:
                rooms.pop(room_id, None)
            return room, player
        return None, None

    async def broadcast(self, room: Room, message: dict):
        disconnected = []
        for p in room.players:
            try:
                await p.websocket.send_text(json.dumps(message))
            except:
                disconnected.append(p)
        for p in disconnected:
             if p in room.players:
                 room.players.remove(p)

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_text(json.dumps(message))
        except:
             pass

manager = ConnectionManager()

@app.websocket("/ws/{room_id}/{username}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, username: str):
    connection = await manager.connect(websocket, room_id, username)
    room: Room = connection[0]
    player: Player = connection[1]
    print(f"Connected: {username} to {room_id}")
    
    await manager.broadcast(room, {
        "type": "players",
        "data": [{"id": p.id, "username": p.username, "score": p.score} for p in room.players]
    })
    
    await manager.broadcast(room, {
        "type": "system_chat",
        "data": f"{username} joined the room."
    })
    
    # Send current state
    if room.is_playing:
        drawer = room.players[room.drawer_index]
        await manager.send_personal_message({
            "type": "game_started",
            "drawer": drawer.id,
            "word_length": len(room.current_word)
        }, websocket)
        if drawer == player:
            await manager.send_personal_message({
                "type": "word_assignment",
                "word": room.current_word
            }, websocket)
        for path in room.history:
             await manager.send_personal_message({"type": "draw", "data": path}, websocket)

    try:
        while True:
            assert isinstance(room, Room)
            assert isinstance(player, Player)
            data_str = await websocket.receive_text()
            try:
                data = json.loads(data_str)
                msg_type = data.get('type')
            except Exception:
                continue

            if not msg_type:
                continue
            
            if msg_type == 'start_game':
                if not room.is_playing and len(room.players) >= 2:
                    room.drawer_index = 0
                    if room.start_game():
                        drawer = room.players[room.drawer_index]
                        await manager.broadcast(room, {
                            "type": "game_started",
                            "drawer": drawer.id,
                            "word_length": len(room.current_word)
                        })
                        await manager.send_personal_message({
                            "type": "word_assignment",
                            "word": room.current_word
                        }, drawer.websocket)
                        
                        await manager.broadcast(room, {
                            "type": "system_chat",
                            "data": f"{drawer.username} is drawing now!"
                        })
            
            elif msg_type == 'draw':
                if room.is_playing and len(room.players) > 0 and room.players[room.drawer_index] == player:
                    room.history.append(data.get('data'))
                    await manager.broadcast(room, {
                        "type": "draw",
                        "data": data.get('data')
                    })
            
            elif msg_type == 'clear':
                if room.is_playing and len(room.players) > 0 and room.players[room.drawer_index] == player:
                    room.history = []
                    await manager.broadcast(room, {"type": "clear"})
            
            elif msg_type == 'chat':
                msg = data.get('message', '').strip()
                if not msg:
                    continue
                
                is_drawer = (len(room.players) > 0 and room.players[room.drawer_index] == player)
                has_guessed = player.id in room.guessed_correctly
                
                if room.is_playing and not is_drawer and not has_guessed:
                    if msg.lower() == room.current_word.lower():
                        player.score += 10
                        room.guessed_correctly.add(player.id)
                        await manager.broadcast(room, {
                            "type": "system_chat",
                            "data": f"{player.username} guessed the word!"
                        })
                        await manager.broadcast(room, {
                            "type": "players",
                            "data": [{"id": p.id, "username": p.username, "score": p.score} for p in room.players]
                        })
                        
                        if len(room.guessed_correctly) >= len(room.players) - 1:
                            room.players[room.drawer_index].score += 5
                            await manager.broadcast(room, {
                                "type": "system_chat",
                                "data": f"Everyone guessed it! The word was {room.current_word}."
                            })
                            room.next_turn()
                            drawer = room.players[room.drawer_index]
                            await manager.broadcast(room, {
                                "type": "game_started",
                                "drawer": drawer.id,
                                "word_length": len(room.current_word)
                            })
                            await manager.send_personal_message({
                                "type": "word_assignment",
                                "word": room.current_word
                            }, drawer.websocket)
                        continue
                
                await manager.broadcast(room, {
                    "type": "chat",
                    "username": player.username,
                    "message": msg
                })

    except Exception:
        pass
    finally:
        d_room, d_player = manager.disconnect(websocket, room_id)
        if d_room and d_player:
            await manager.broadcast(d_room, {
                "type": "players",
                "data": [{"id": p.id, "username": p.username, "score": p.score} for p in d_room.players]
            })
            await manager.broadcast(d_room, {
                "type": "system_chat",
                "data": f"{d_player.username} left."
            })
            if len(d_room.players) < 2 and d_room.is_playing:
                d_room.is_playing = False
                await manager.broadcast(d_room, {
                    "type": "system_chat",
                    "data": "Not enough players to continue."
                })
