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


def user_list_message(users: list) -> dict:
    return {
        "type": MessageType.USER_LIST,
        "users": users
    }


def sharer_changed_message(sharer_id: str | None, sharer_name: str | None) -> dict:
    return {
        "type": MessageType.SHARER_CHANGED,
        "sharerId": sharer_id,
        "sharerName": sharer_name
    }


def signal_message(sender_id: str, data: dict) -> dict:
    return {
        "type": MessageType.SIGNAL,
        "sender": sender_id,
        "data": data
    }


def pong_message() -> dict:
    return {"type": MessageType.PONG}
