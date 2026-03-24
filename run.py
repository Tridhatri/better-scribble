import json
import random
from typing import Dict, List, Set, Tuple
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.models import Player, Room
from app.manager import manager, rooms

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def get_index():
    return FileResponse("static/index.html")

@app.websocket("/ws/{room_id}/{username}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, username: str):
    connection = await manager.connect(websocket, room_id, username)
    room: Room = connection[0]
    player: Player = connection[1]
    print(f"Connected: {username} to {room_id}")

    # Send current state
    await manager.broadcast(room, {
        "type": "players",
        "data": [{"id": p.id, "username": p.username, "score": p.score} for p in room.players]
    })
    
    if room.is_playing:
        drawer = room.players[room.drawer_index]
        await manager.send_personal_message({
            "type": "game_started",
            "drawer": drawer.id,
            "word_length": len(room.current_word)
        }, websocket)
        
        if drawer.websocket == websocket:
            await manager.send_personal_message({
                "type": "word_assignment",
                "word": room.current_word
            }, websocket)
        
        for path in room.history:
              await manager.send_personal_message({"type": "draw", "data": path}, websocket)

    try:
        while True:
            data_str = await websocket.receive_text()
            try:
                data = json.loads(data_str)
                msg_type = data.get('type')
            except Exception:
                continue

            if not msg_type:
                continue
            
            if msg_type == 'start_game':
                if not room.is_playing and len(room.players) >= 1:
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
                solo_mode = not room.is_playing and len(room.players) == 1
                if solo_mode:
                    room.history.append(data.get('data'))
                    await manager.broadcast(room, {"type": "draw", "data": data.get('data')})
                elif room.is_playing and len(room.players) > 0:
                    drawer = room.players[room.drawer_index]
                    if drawer.websocket == websocket:
                        room.history.append(data.get('data'))
                        await manager.broadcast(room, {
                            "type": "draw",
                            "data": data.get('data')
                        })

            elif msg_type == 'clear':
                solo_mode = not room.is_playing and len(room.players) == 1
                if solo_mode:
                    room.history = []
                    await manager.broadcast(room, {"type": "clear"})
                elif room.is_playing:
                    drawer = room.players[room.drawer_index]
                    if drawer.websocket == websocket:
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

    except WebSocketDisconnect:
        room, player = manager.disconnect(websocket, room_id)
        if room:
             await manager.broadcast(room, {
                "id": player.id,
                "type": "chat",
                "username": "System",
                "message": f"{player.username} has left the room."
            })
             await manager.broadcast(room, {
                "type": "players",
                "data": [{"id": p.id, "username": p.username, "score": p.score} for p in room.players]
            })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("run:app", host="0.0.0.0", port=8000, reload=True)
