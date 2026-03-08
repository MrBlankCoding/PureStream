import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_create_room(client):
    response = client.get("/new-room")
    assert response.status_code == 200
    assert "room_id" in response.json()
    assert len(response.json()["room_id"]) == 8


def test_turn_credentials(client):
    response = client.get("/turn-credentials")
    assert response.status_code == 200
    assert "iceServers" in response.json()


def test_websocket_join(client):
    with client.websocket_connect("/ws/room1/user1") as websocket:
        websocket.send_json({"type": "JOIN", "username": "Alice"})

        data = websocket.receive_json()
        assert data["type"] == "USER_LIST"
        assert len(data["users"]) == 1
        assert data["users"][0]["id"] == "user1"
        assert data["users"][0]["username"] == "Alice"


def test_websocket_chat(client):
    with client.websocket_connect("/ws/room1/user1") as websocket:
        websocket.send_json({"type": "JOIN", "username": "Alice"})
        # skip user list
        websocket.receive_json()

        websocket.send_json({"type": "CHAT", "text": "Hello world", "username": "Alice"})

        data = websocket.receive_json()
        assert data["type"] == "CHAT"
        assert data["text"] == "Hello world"
        assert data["username"] == "Alice"
