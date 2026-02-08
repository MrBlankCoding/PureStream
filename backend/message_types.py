from enum import Enum


class MessageType(str, Enum):
    JOIN = "join"
    SIGNAL = "signal"
    USER_LIST = "user-list"
    SHARER_CHANGED = "sharer-changed"
    START_SHARING = "start-sharing"
    STOP_SHARING = "stop-sharing"
    PING = "ping"
    PONG = "pong"
    VOICE_SIGNAL = "voice-signal"
    VOICE_STATE = "voice-state"
    CHAT = "chat"
    CALL_STATE = "call-state"
    CHAT_HISTORY = "chat-history"
    WHITEBOARD_START = "whiteboard-start"
    WHITEBOARD_STOP = "whiteboard-stop"
    WHITEBOARD_UPDATE = "whiteboard-update"
    WHITEBOARD_CURSOR = "whiteboard-cursor"


def user_list_message(users: list) -> dict:
    return {"type": MessageType.USER_LIST, "users": users}


def sharer_changed_message(sharer_id: str | None, sharer_name: str | None) -> dict:
    return {"type": MessageType.SHARER_CHANGED, "sharerId": sharer_id, "sharerName": sharer_name}


def signal_message(sender_id: str, data: dict) -> dict:
    return {"type": MessageType.SIGNAL, "sender": sender_id, "data": data}


def pong_message() -> dict:
    return {"type": MessageType.PONG}


def voice_signal_message(sender_id: str, data: dict) -> dict:
    return {"type": MessageType.VOICE_SIGNAL, "sender": sender_id, "data": data}


def voice_state_message(user_id: str, muted: bool, deafened: bool, in_call: bool | None = None) -> dict:
    return {"type": MessageType.VOICE_STATE, "userId": user_id, "muted": muted, "deafened": deafened, "inCall": in_call}


def chat_message(user_id: str, username: str, text: str, timestamp: float) -> dict:
    return {"type": MessageType.CHAT, "userId": user_id, "username": username, "text": text, "timestamp": timestamp}


def call_state_message(user_id: str, in_call: bool) -> dict:
    return {"type": MessageType.CALL_STATE, "userId": user_id, "inCall": in_call}


def chat_history_message(messages: list[dict]) -> dict:
    return {"type": MessageType.CHAT_HISTORY, "messages": messages}


def whiteboard_start_message(sender_id: str) -> dict:
    return {"type": MessageType.WHITEBOARD_START, "sender": sender_id}


def whiteboard_stop_message(sender_id: str) -> dict:
    return {"type": MessageType.WHITEBOARD_STOP, "sender": sender_id}


def whiteboard_update_message(sender_id: str, data: dict) -> dict:
    return {"type": MessageType.WHITEBOARD_UPDATE, "sender": sender_id, "data": data}


def whiteboard_cursor_message(sender_id: str, data: dict, username: str) -> dict:
    return {"type": MessageType.WHITEBOARD_CURSOR, "sender": sender_id, "data": data, "username": username}
