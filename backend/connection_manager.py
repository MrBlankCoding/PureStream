import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any
from fastapi import WebSocket


HEARTBEAT_INTERVAL = 10
HEARTBEAT_TIMEOUT = 30


@dataclass
class User:
    ws: WebSocket
    username: str
    last_heartbeat: float = field(default_factory=time.time)


@dataclass
class Room:
    users: dict[str, User] = field(default_factory=dict)
    sharer_id: str | None = None


class ConnectionManager:
    def __init__(self):
        self._rooms: dict[str, Room] = {}
        self._lock = asyncio.Lock()

    async def join_room(self, room_id: str, user_id: str, ws: WebSocket, username: str) -> None:
        async with self._lock:
            if room_id not in self._rooms:
                self._rooms[room_id] = Room()
            self._rooms[room_id].users[user_id] = User(ws=ws, username=username)

    async def leave_room(self, room_id: str, user_id: str) -> bool:
        async with self._lock:
            if room_id not in self._rooms:
                return False
            room = self._rooms[room_id]
            if user_id not in room.users:
                return False
            
            del room.users[user_id]
            
            was_sharer = room.sharer_id == user_id
            if was_sharer:
                room.sharer_id = None
            
            if not room.users:
                del self._rooms[room_id]
            
            return was_sharer

    async def set_sharer(self, room_id: str, user_id: str | None) -> tuple[str | None, str | None]:
        async with self._lock:
            if room_id not in self._rooms:
                return None, None
            room = self._rooms[room_id]
            room.sharer_id = user_id
            if user_id and user_id in room.users:
                return user_id, room.users[user_id].username
            return None, None

    async def get_sharer(self, room_id: str) -> tuple[str | None, str | None]:
        async with self._lock:
            if room_id not in self._rooms:
                return None, None
            room = self._rooms[room_id]
            if room.sharer_id and room.sharer_id in room.users:
                return room.sharer_id, room.users[room.sharer_id].username
            return None, None

    async def update_username(self, room_id: str, user_id: str, username: str) -> None:
        async with self._lock:
            if room_id in self._rooms and user_id in self._rooms[room_id].users:
                self._rooms[room_id].users[user_id].username = username

    async def update_heartbeat(self, room_id: str, user_id: str) -> None:
        async with self._lock:
            if room_id in self._rooms and user_id in self._rooms[room_id].users:
                self._rooms[room_id].users[user_id].last_heartbeat = time.time()

    async def get_user_list(self, room_id: str) -> list[dict]:
        async with self._lock:
            if room_id not in self._rooms:
                return []
            return [
                {"id": uid, "username": u.username}
                for uid, u in self._rooms[room_id].users.items()
            ]

    async def broadcast(self, room_id: str, message: dict, exclude_id: str | None = None) -> None:
        async with self._lock:
            if room_id not in self._rooms:
                return
            json_msg = json.dumps(message)
            tasks = []
            for uid, user in self._rooms[room_id].users.items():
                if uid != exclude_id:
                    tasks.append(self._safe_send(user.ws, json_msg))
            if tasks:
                await asyncio.gather(*tasks)

    async def send_to_user(self, room_id: str, user_id: str, message: dict) -> bool:
        async with self._lock:
            if room_id not in self._rooms or user_id not in self._rooms[room_id].users:
                return False
            json_msg = json.dumps(message)
            await self._safe_send(self._rooms[room_id].users[user_id].ws, json_msg)
            return True

    async def cleanup_stale_connections(self) -> list[tuple[str, str, bool]]:
        removed = []
        current_time = time.time()
        async with self._lock:
            for room_id, room in list(self._rooms.items()):
                for user_id, user in list(room.users.items()):
                    if current_time - user.last_heartbeat > HEARTBEAT_TIMEOUT:
                        was_sharer = room.sharer_id == user_id
                        if was_sharer:
                            room.sharer_id = None
                        del room.users[user_id]
                        removed.append((room_id, user_id, was_sharer))
                
                if not room.users:
                    del self._rooms[room_id]
        return removed

    async def _safe_send(self, ws: WebSocket, message: str) -> None:
        try:
            await ws.send_text(message)
        except:
            pass

    def room_exists(self, room_id: str) -> bool:
        return room_id in self._rooms


manager = ConnectionManager()
