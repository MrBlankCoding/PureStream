import "./styles.css";
import { showToast } from "./ui.js";
import { createIcons, icons } from "lucide";

createIcons({ icons });

const usernameInput = document.getElementById("username-input") as HTMLInputElement;
const roomCodeInput = document.getElementById("room-code-input") as HTMLInputElement;
const createRoomBtn = document.getElementById("create-room-btn") as HTMLButtonElement;
const joinRoomBtn = document.getElementById("join-room-btn") as HTMLButtonElement;

const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get("room");
if (urlRoom) {
    roomCodeInput.value = urlRoom;
}

const savedUsername = localStorage.getItem("purestream_username");
if (savedUsername) {
    usernameInput.value = savedUsername;
}

createRoomBtn.onclick = async () => {
    const username = usernameInput.value.trim();
    if (!username) {
        showToast("Please enter a username", "error");
        return;
    }
    localStorage.setItem("purestream_username", username);

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
    localStorage.setItem("purestream_username", username);

    const code = roomCodeInput.value.trim();
    if (!code) {
        showToast("Please enter a Room ID", "error");
        return;
    }
    enterRoom(code, username);
};

function enterRoom(roomId: string, username: string): void {
    window.location.href = `/viewer.html?room=${roomId}&username=${encodeURIComponent(username)}`;
}
