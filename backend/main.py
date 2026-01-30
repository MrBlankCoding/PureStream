import asyncio
import json
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from connection_manager import HEARTBEAT_INTERVAL, manager
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from message_types import (
    MessageType,
    call_state_message,
    chat_history_message,
    chat_message,
    pong_message,
    sharer_changed_message,
    signal_message,
    user_list_message,
    voice_signal_message,
    voice_state_message,
)
from sfu import sfu
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


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
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
                history = await manager.get_chat_history(room_id)
                if history:
                    await manager.send_to_user(room_id, user_id, chat_history_message(history))
                sharer_id, sharer_name = await manager.get_sharer(room_id)
                if sharer_id:
                    await manager.send_to_user(room_id, user_id, sharer_changed_message(sharer_id, sharer_name))

            elif msg_type == MessageType.SIGNAL:
                target_id = message.get("target")
                data = message.get("data")

                if target_id == "sfu":
                    if data.get("type") == "offer":
                        # Determine if this offer is from a publisher based on the provided intent
                        # Use intent instead of relying on the current sharer to avoid races
                        is_sharer = data.get("intent") == "publish"

                        answer = await sfu.handle_offer(room_id, user_id, data["sdp"], is_sharer)
                        await manager.send_to_user(
                            room_id, user_id, signal_message("sfu", {"type": "answer", "sdp": answer.sdp})
                        )
                    elif data.get("type") == "candidate":
                        await sfu.handle_ice_candidate(user_id, data["candidate"])

                elif target_id:
                    await manager.send_to_user(room_id, target_id, signal_message(user_id, data))

            elif msg_type == MessageType.START_SHARING:
                sharer_id, sharer_name = await manager.set_sharer(room_id, user_id)
                if sharer_id == user_id:
                    await broadcast_sharer_changed(room_id, sharer_id, sharer_name)
                else:
                    await manager.send_to_user(room_id, user_id, sharer_changed_message(sharer_id, sharer_name))

            elif msg_type == MessageType.STOP_SHARING:
                current_sharer, _ = await manager.get_sharer(room_id)
                await sfu.cleanup_user(room_id, user_id)
                if current_sharer == user_id:
                    await manager.set_sharer(room_id, None)
                    await broadcast_sharer_changed(room_id, None, None)

            elif msg_type == MessageType.PING:
                await manager.update_heartbeat(room_id, user_id)
                await manager.send_to_user(room_id, user_id, pong_message())

            elif msg_type == MessageType.VOICE_SIGNAL:
                target_id = message.get("target")
                if target_id:
                    await manager.send_to_user(room_id, target_id, voice_signal_message(user_id, message.get("data")))

            elif msg_type == MessageType.VOICE_STATE:
                muted = message.get("muted", False)
                deafened = message.get("deafened", False)
                await manager.update_voice_state(room_id, user_id, muted, deafened)
                await manager.broadcast(room_id, voice_state_message(user_id, muted, deafened), exclude_id=user_id)

            elif msg_type == MessageType.CALL_STATE:
                in_call = message.get("inCall", False)
                updated = await manager.update_call_state(room_id, user_id, in_call)
                if updated:
                    await manager.broadcast(room_id, call_state_message(user_id, in_call), exclude_id=None)
                    await broadcast_user_list(room_id)

            elif msg_type == MessageType.CHAT:
                text = (message.get("text") or "").strip()
                if text:
                    username = message.get("username") or "Anonymous"
                    ts = time.time()
                    msg = chat_message(user_id, username, text[:400], ts)
                    await manager.add_chat_message(room_id, msg)
                    await manager.broadcast(room_id, msg)

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
@limiter.limit("5/minute")
async def create_room(request: Request):
    return {"room_id": str(uuid.uuid4())[:8]}


@app.get("/turn-credentials")
@limiter.limit("20/minute")
async def get_turn_credentials(request: Request):
    api_key = os.getenv("METERED_TURN_API_KEY")
    if not api_key:
        return {"iceServers": [{"urls": "stun:stun.l.google.com:19302"}, {"urls": "stun:stun1.l.google.com:19302"}]}

    return {
        "iceServers": [
            {"urls": "turn:global.turn.metered.ca:80", "username": "user", "credential": api_key},
            {"urls": "stun:stun.l.google.com:19302"},
        ]
    }


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
