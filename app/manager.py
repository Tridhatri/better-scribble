import json
from typing import Dict, Tuple
from fastapi import WebSocket
from .models import Player, Room

rooms: Dict[str, Room] = {}

class ConnectionManager:
    async def connect(self, websocket: WebSocket, room_id: str, username: str) -> Tuple[Room, Player]:
        await websocket.accept()
        if room_id not in rooms:
            rooms[room_id] = Room(room_id)
        room = rooms[room_id]
        
        # GHOST BUSTER: Look for existing player with same username to replace
        existing_player = None
        for p in room.players:
            if p.username == username:
                existing_player = p
                break
        
        if existing_player:
            existing_player.websocket = websocket
            return room, existing_player
        else:
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
        data = json.dumps(message)
        for p in room.players:
            try:
                await p.websocket.send_text(data)
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
