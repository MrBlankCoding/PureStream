import "./styles.css";
import { showToast } from "./ui.js";
import { createIcons, icons } from "lucide/dist/cjs/lucide.js";

createIcons({ icons });

const usernameInput = document.getElementById("username-input");
const roomCodeInput = document.getElementById("room-code-input");
const createRoomBtn = document.getElementById("create-room-btn");
const joinRoomBtn = document.getElementById("join-room-btn");

const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get("room");
if (urlRoom) {
    roomCodeInput.value = urlRoom;
}

createRoomBtn.onclick = async () => {
    const username = usernameInput.value.trim();
    if (!username) {
        showToast("Please enter a username", "error");
        return;
    }

    try {
        const res = await fetch("/new-room");
        const data = await res.json();
        enterRoom(data.room_id, username);
    } catch (e) {
        showToast("Error creating room", "error");
        console.error(e);
    }
};

joinRoomBtn.onclick = () => {
    const username = usernameInput.value.trim();
    if (!username) {
        showToast("Please enter a username", "error");
        return;
    }

    const code = roomCodeInput.value.trim();
    if (!code) {
        showToast("Please enter a Room ID", "error");
        return;
    }
    enterRoom(code, username);
};

function enterRoom(roomId, username) {
    window.location.href = `/viewer.html?room=${roomId}&username=${encodeURIComponent(username)}`;
}
