import random
from typing import List, Set, Tuple, Dict
from fastapi import WebSocket

WORDS = [
    # Level 1
    "apple", "cat", "dog", "fish", "ball", "sun", "tree", "hat", "cup", "book", 
    "door", "lamp", "frog", "bird", "milk", "egg", "star", "cake", "boat", "car",
    # Level 2
    "banana", "orange", "grape", "house", "train", "piano", "guitar", "pencil", 
    "spider", "school", "bridge", "flower", "rabbit", "burger", "camera", "cheese",
    # Level 3
    "computer", "bicycle", "airplane", "volcano", "umbrella", "penguin", "elephant", 
    "backpack", "butterfly", "sandwich", "keyboard", "mountain", "telescope", "dinosaur",
    # Level 4
    "watermelon", "smartphone", "spaceship", "xylophone", "microphone", "skyscraper", 
    "helicopter", "lighthouse", "strawberry", "motorcycle", "earthquake", "environment"
]

class Player:
    websocket: WebSocket
    username: str
    id: str
    score: int

    def __init__(self, websocket: WebSocket, username: str):
        self.websocket = websocket
        self.username = username
        self.id = str(id(websocket))
        self.score = 0

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
        if len(self.players) >= 1:
            self.is_playing = True
            self.drawer_index = 0
            self.start_turn()
            return True
        return False

    def next_turn(self):
        self.drawer_index = (self.drawer_index + 1) % len(self.players)
        self.start_turn()

    def start_turn(self):
        self.current_word = random.choice(WORDS)
        self.history = []
        self.guessed_correctly = set()
