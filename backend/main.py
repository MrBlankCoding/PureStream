import uuid
import json
import asyncio
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from connection_manager import manager, HEARTBEAT_INTERVAL
from message_types import (
    MessageType,
    user_list_message,
    sharer_changed_message,
    signal_message,
    pong_message,
    voice_signal_message,
    voice_state_message
)


async def heartbeat_cleanup_task():
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        removed = await manager.cleanup_stale_connections()
        for room_id, user_id, was_sharer in removed:
            await broadcast_user_list(room_id)
            if was_sharer:
                await broadcast_sharer_changed(room_id, None, None)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(heartbeat_cleanup_task())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR.parent / "frontend" / "dist"


@app.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    await manager.join_room(room_id, user_id, websocket, "Anonymous")

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            if msg_type == MessageType.JOIN:
                username = message.get("username", "Anonymous")
                await manager.update_username(room_id, user_id, username)
                await broadcast_user_list(room_id)
                sharer_id, sharer_name = await manager.get_sharer(room_id)
                if sharer_id:
                    await manager.send_to_user(
                        room_id, 
                        user_id, 
                        sharer_changed_message(sharer_id, sharer_name)
                    )

            elif msg_type == MessageType.SIGNAL:
                target_id = message.get("target")
                if target_id:
                    await manager.send_to_user(
                        room_id,
                        target_id,
                        signal_message(user_id, message.get("data"))
                    )

            elif msg_type == MessageType.START_SHARING:
                sharer_id, sharer_name = await manager.set_sharer(room_id, user_id)
                await broadcast_sharer_changed(room_id, sharer_id, sharer_name)

            elif msg_type == MessageType.STOP_SHARING:
                current_sharer, _ = await manager.get_sharer(room_id)
                if current_sharer == user_id:
                    await manager.set_sharer(room_id, None)
                    await broadcast_sharer_changed(room_id, None, None)

            elif msg_type == MessageType.PING:
                await manager.update_heartbeat(room_id, user_id)
                await manager.send_to_user(room_id, user_id, pong_message())

            elif msg_type == MessageType.VOICE_SIGNAL:
                target_id = message.get("target")
                if target_id:
                    await manager.send_to_user(
                        room_id,
                        target_id,
                        voice_signal_message(user_id, message.get("data"))
                    )

            elif msg_type == MessageType.VOICE_STATE:
                muted = message.get("muted", False)
                deafened = message.get("deafened", False)
                await manager.update_voice_state(room_id, user_id, muted, deafened)
                await manager.broadcast(
                    room_id,
                    voice_state_message(user_id, muted, deafened),
                    exclude_id=user_id
                )

    except WebSocketDisconnect:
        pass
    finally:
        was_sharer = await manager.leave_room(room_id, user_id)
        if manager.room_exists(room_id):
            await broadcast_user_list(room_id)
            if was_sharer:
                await broadcast_sharer_changed(room_id, None, None)


async def broadcast_user_list(room_id: str):
    users = await manager.get_user_list(room_id)
    await manager.broadcast(room_id, user_list_message(users))


async def broadcast_sharer_changed(room_id: str, sharer_id: str | None, sharer_name: str | None):
    await manager.broadcast(room_id, sharer_changed_message(sharer_id, sharer_name))


@app.get("/new-room")
async def create_room():
    return {"room_id": str(uuid.uuid4())[:8]}


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)