import "./styles.css";
import { state } from "./state.js";
import { ws } from "./websocket.js";
import { rtc } from "./webrtc.js";
import {
    renderUserList,
    updateVideoStage,
    updateShareControls,
    showToast,
    setVideoSource
} from "./ui.js";
import { createIcons, icons } from "lucide/dist/cjs/lucide.js";

createIcons({ icons });

const copyRoomIdBtn = document.getElementById("copy-room-id");
const leaveBtn = document.getElementById("leave-btn");
const shareScreenBtn = document.getElementById("share-screen-btn");
const stopShareBtn = document.getElementById("stop-share-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const videoStage = document.getElementById("video-stage");
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("room");
const username = urlParams.get("username");

if (!roomId || !username) {
    window.location.href = "/";
} else {
    initViewer(roomId, username);
}

function initViewer(roomId, username) {
    state.setUsername(username);
    state.setRoomId(roomId);
    document.getElementById("room-id-display").textContent = roomId;
    document.getElementById("my-username").textContent = username;
    document.getElementById("my-avatar").textContent = username.charAt(0).toUpperCase();

    initConnection();
}

leaveBtn.onclick = () => {
    window.location.href = "/";
};

shareScreenBtn.onclick = startSharing;
stopShareBtn.onclick = stopSharing;

fullscreenBtn.onclick = toggleFullscreen;

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        videoStage.requestFullscreen().catch(err => {
            showToast(`Error attempting to enable fullscreen: ${err.message}`, "error");
        });
    } else {
        document.exitFullscreen();
    }
}

document.addEventListener("fullscreenchange", () => {
    const icon = fullscreenBtn.querySelector("i");
    if (document.fullscreenElement) {
        icon.setAttribute("data-lucide", "minimize");
        fullscreenBtn.title = "Exit Fullscreen";
    } else {
        icon.setAttribute("data-lucide", "maximize");
        fullscreenBtn.title = "Enter Fullscreen";
    }
    createIcons({ icons, nameAttr: 'data-lucide', attrs: { class: "w-5 h-5" } });
});

copyRoomIdBtn.onclick = () => {
    navigator.clipboard.writeText(state.roomId);
    showToast("Room ID copied!");
};

function initConnection() {
    ws.on("open", () => {
        ws.send({ type: "join", username: state.username });
    });

    ws.on("user-list", (msg) => {
        state.setUsers(msg.users);
        renderUserList(msg.users, state.sharerId, state.userId);

        if (state.isSharing) {
            msg.users.forEach(u => {
                if (u.id !== state.userId) {
                    rtc.connectToNewUser(u.id);
                }
            });
        }
    });

    ws.on("sharer-changed", (msg) => {
        state.setSharer(msg.sharerId, msg.sharerName);
        renderUserList(state.users, msg.sharerId, state.userId);

        if (!msg.sharerId) {
            updateVideoStage(false, null);
        }
    });

    ws.on("signal", async (msg) => {
        await rtc.handleSignal(msg.sender, msg.data);
    });

    ws.on("close", () => {
        showToast("Connection lost, reconnecting...", "error");
    });

    rtc.setOnTrack((stream, senderId) => {
        setVideoSource(stream);
        updateVideoStage(true, state.sharerName || "Someone");
    });

    rtc.setOnDisconnect((id) => {
        if (id === "local") {
            ws.send({ type: "stop-sharing" });
            state.setIsSharing(false);
            updateShareControls(false);
        }
    });

    ws.connect(state.roomId, state.userId);
}

async function startSharing() {
    try {
        await rtc.startSharing(state.users, state.userId);
        state.setIsSharing(true);
        updateShareControls(true);
        ws.send({ type: "start-sharing" });
    } catch (err) {
        showToast("Failed to start share: " + err.message, "error");
    }
}

function stopSharing() {
    rtc.stopSharing();
    state.setIsSharing(false);
    updateShareControls(false);
    ws.send({ type: "stop-sharing" });
}
