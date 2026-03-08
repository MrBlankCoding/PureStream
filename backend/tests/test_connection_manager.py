from unittest.mock import AsyncMock

import pytest
from connection_manager import ConnectionManager


@pytest.fixture
def manager():
    return ConnectionManager()


@pytest.mark.asyncio
async def test_join_leave_room(manager):
    room_id = "test_room"
    user_id = "user_1"
    ws = AsyncMock()

    await manager.join_room(room_id, user_id, ws, "Alice")
    assert manager.room_exists(room_id)

    users = await manager.get_user_list(room_id)
    assert len(users) == 1
    assert users[0]["username"] == "Alice"

    was_sharer = await manager.leave_room(room_id, user_id)
    assert not was_sharer
    assert not manager.room_exists(room_id)


@pytest.mark.asyncio
async def test_set_sharer(manager):
    room_id = "test_room"
    user_id_1 = "user_1"
    user_id_2 = "user_2"
    ws = AsyncMock()

    await manager.join_room(room_id, user_id_1, ws, "Alice")
    await manager.join_room(room_id, user_id_2, ws, "Bob")

    # Alice starts sharing
    sid, sname = await manager.set_sharer(room_id, user_id_1)
    assert sid == user_id_1
    assert sname == "Alice"

    # Bob tries to share while Alice is sharing
    sid, sname = await manager.set_sharer(room_id, user_id_2)
    assert sid == user_id_1
    assert sname == "Alice"

    # Alice stops sharing
    await manager.set_sharer(room_id, None)
    sid, sname = await manager.get_sharer(room_id)
    assert sid is None

    # Bob can now share
    sid, sname = await manager.set_sharer(room_id, user_id_2)
    assert sid == user_id_2
    assert sname == "Bob"


@pytest.mark.asyncio
async def test_chat_history(manager):
    room_id = "test_room"
    user_id = "user_1"
    ws = AsyncMock()

    await manager.join_room(room_id, user_id, ws, "Alice")

    msg = {"user": "Alice", "text": "Hello"}
    await manager.add_chat_message(room_id, msg)

    history = await manager.get_chat_history(room_id)
    assert len(history) == 1
    assert history[0] == msg


@pytest.mark.asyncio
async def test_cleanup_stale_connections(manager):
    import time

    room_id = "test_room"
    user_id = "user_1"
    ws = AsyncMock()

    await manager.join_room(room_id, user_id, ws, "Alice")

    # Mock stale heartbeat
    async with manager._lock:
        manager._rooms[room_id].users[user_id].last_heartbeat = time.time() - 40

    removed = await manager.cleanup_stale_connections()
    assert len(removed) == 1
    assert removed[0][0] == room_id
    assert removed[0][1] == user_id
    assert not manager.room_exists(room_id)
