import "./styles.css";
import { state } from "./state.js";
import { ws } from "./websocket.js";
import { rtc } from "./webrtc.js";
import { voice } from "./voicechat.js";
import {
    renderUserList,
    updateVideoStage,
    updateShareControls,
    showToast,
    setVideoSource,
    updateVoiceControls
} from "./ui.js";
import { createIcons, icons } from "lucide/dist/cjs/lucide.js";

createIcons({ icons });

const copyRoomIdBtn = document.getElementById("copy-room-id");
const leaveBtn = document.getElementById("leave-btn");
const shareScreenBtn = document.getElementById("share-screen-btn");
const stopShareBtn = document.getElementById("stop-share-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const muteBtn = document.getElementById("mute-btn");
const deafenBtn = document.getElementById("deafen-btn");
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
    voice.stop();
    ws.disconnect();
    window.location.href = "/";
};

window.addEventListener("beforeunload", () => {
    voice.stop();
    ws.disconnect();
});

fullscreenBtn.onclick = toggleFullscreen;

muteBtn.onclick = toggleMute;
deafenBtn.onclick = toggleDeafen;

function toggleMute() {
    const newMuted = !state.voiceMuted;
    voice.setMuted(newMuted);
    state.setVoiceMuted(newMuted);
    updateVoiceControls(newMuted, state.voiceDeafened);
    renderUserList(state.users, state.sharerId, state.userId, state.voicePeers);
}

function toggleDeafen() {
    const newDeafened = !state.voiceDeafened;
    voice.setDeafened(newDeafened);
    state.setVoiceDeafened(newDeafened);
    updateVoiceControls(state.voiceMuted, newDeafened);
    renderUserList(state.users, state.sharerId, state.userId, state.voicePeers);
}

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
        msg.users.forEach(u => {
            if (u.id !== state.userId) {
                state.setVoicePeerState(u.id, u.muted, u.deafened);
            }
        });
        renderUserList(msg.users, state.sharerId, state.userId, state.voicePeers);

        if (state.isSharing) {
            msg.users.forEach(u => {
                if (u.id !== state.userId) {
                    rtc.connectToNewUser(u.id);
                }
            });
        }

        if (voice.isActive) {
            msg.users.forEach(u => {
                if (u.id !== state.userId) {
                    voice.connectToUser(u.id);
                }
            });
        }
    });

    ws.on("sharer-changed", (msg) => {
        state.setSharer(msg.sharerId, msg.sharerName);
        renderUserList(state.users, msg.sharerId, state.userId, state.voicePeers);

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

    ws.on("voice-signal", async (msg) => {
        await voice.handleSignal(msg.sender, msg.data);
    });

    ws.on("voice-state", (msg) => {
        state.setVoicePeerState(msg.userId, msg.muted, msg.deafened);
        renderUserList(state.users, state.sharerId, state.userId, state.voicePeers);
    });

    voice.setOnStateChange((muted, deafened) => {
        state.setVoiceMuted(muted);
        state.setVoiceDeafened(deafened);
        updateVoiceControls(muted, deafened);
    });

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

    shareScreenBtn.onclick = startSharing;
    stopShareBtn.onclick = stopSharing;

    ws.connect(state.roomId, state.userId);

    startVoiceChat();

    async function startVoiceChat() {
        const success = await voice.start(state.users, state.userId);
        if (success) {
            state.users.forEach(u => {
                if (u.id !== state.userId) {
                    voice.connectToUser(u.id);
                }
            });
        } else {
            showToast("Microphone access denied. Voice chat disabled.", "error");
        }
    }
}