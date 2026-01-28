import "./styles.css";
import { state } from "./state.js";
import { ws } from "./websocket.js";
import { rtc } from "./webrtc/index.js";
import { voice } from "./voicechat.js";
import {
    renderUserList,
    updateVideoStage,
    updateShareControls,
    showToast,
    setVideoSource,
    setLocalPreviewSource,
    updateVoiceControls,
    renderChat
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
const joinCallBtn = document.getElementById("join-call-btn");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
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
joinCallBtn.onclick = toggleCall;

function toggleMute() {
    const newMuted = !state.voiceMuted;
    voice.setMuted(newMuted);
    state.setVoiceMuted(newMuted);
    updateVoiceControls(newMuted, state.voiceDeafened, state.inCall);
    renderUserList(state.users, state.sharerId, state.userId, state.voicePeers);
}

function toggleDeafen() {
    const newDeafened = !state.voiceDeafened;
    voice.setDeafened(newDeafened);
    state.setVoiceDeafened(newDeafened);
    updateVoiceControls(state.voiceMuted, newDeafened, state.inCall);
    renderUserList(state.users, state.sharerId, state.userId, state.voicePeers);
}

async function toggleCall() {
    if (state.inCall) {
        voice.stop();
        state.setInCall(false);
        state.setVoiceMuted(false);
        state.setVoiceDeafened(false);
        updateVoiceControls(false, false, false);
        ws.send({ type: "call-state", inCall: false });
        renderUserList(state.users, state.sharerId, state.userId, state.voicePeers);
        joinCallBtn.classList.remove("bg-red-600", "hover:bg-red-700");
        joinCallBtn.classList.add("bg-emerald-600", "hover:bg-emerald-700");
        joinCallBtn.querySelector("span")?.classList.remove("md:inline");
        joinCallBtn.querySelector("span")?.classList.add("md:inline");
        joinCallBtn.querySelector("span").textContent = "Join Call";
        joinCallBtn.querySelector("i")?.setAttribute("data-lucide", "phone-call");
        createIcons({ icons, nameAttr: 'data-lucide', attrs: { class: "w-4 h-4 md:w-5 md:h-5" } });
        return;
    }

    const success = await voice.start(state.users.filter(u => u.inCall), state.userId);
    if (success) {
        state.setInCall(true);
        ws.send({ type: "call-state", inCall: true });
        updateVoiceControls(state.voiceMuted, state.voiceDeafened, true);
        joinCallBtn.classList.remove("bg-emerald-600", "hover:bg-emerald-700");
        joinCallBtn.classList.add("bg-red-600", "hover:bg-red-700");
        joinCallBtn.querySelector("span").textContent = "Leave Call";
        joinCallBtn.querySelector("i")?.setAttribute("data-lucide", "phone-off");
        createIcons({ icons, nameAttr: 'data-lucide', attrs: { class: "w-4 h-4 md:w-5 md:h-5" } });
        state.users.forEach(u => {
            if (u.id !== state.userId && u.inCall) {
                voice.connectToUser(u.id);
            }
        });
    } else {
        showToast("Microphone access denied. Voice call unavailable.", "error");
    }
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

        // If I'm the sharer, I must initiate WebRTC connections to everyone else.
        // Viewers do not initiate offers for screen share.
        if (state.isSharing) {
            msg.users.forEach(u => {
                if (u.id !== state.userId) {
                    rtc.connectToNewUser(u.id);
                }
            });
        }

        if (voice.isActive) {
            msg.users.filter(u => u.inCall && u.id !== state.userId).forEach(u => voice.connectToUser(u.id));
        }
    });

    ws.on("sharer-changed", (msg) => {
        state.setSharer(msg.sharerId, msg.sharerName);
        renderUserList(state.users, msg.sharerId, state.userId, state.voicePeers);

        const someoneElseSharing = Boolean(msg.sharerId && msg.sharerId !== state.userId);
        updateShareControls(state.isSharing, !someoneElseSharing);

        if (msg.sharerId && msg.sharerId !== state.userId) {
            rtc.connectToSharer(msg.sharerId);
        } else if (!msg.sharerId) {
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
            updateShareControls(false, state.sharerId ? state.sharerId === state.userId : true);
        }
    });

    ws.on("voice-signal", async (msg) => {
        await voice.handleSignal(msg.sender, msg.data);
    });

    ws.on("voice-state", (msg) => {
        state.setVoicePeerState(msg.userId, msg.muted, msg.deafened);
        renderUserList(state.users, state.sharerId, state.userId, state.voicePeers);
    });

    ws.on("call-state", (msg) => {
        const updated = state.users.map(u => u.id === msg.userId ? { ...u, inCall: msg.inCall } : u);
        state.setUsers(updated);
        if (msg.userId === state.userId) {
            state.setInCall(msg.inCall);
            updateVoiceControls(state.voiceMuted, state.voiceDeafened, msg.inCall);
        }
        renderUserList(state.users, state.sharerId, state.userId, state.voicePeers);
    });

    ws.on("chat", (msg) => {
        state.appendChatMessage(msg);
        renderChat(state.chat, state.userId);
    });

    ws.on("chat-history", (msg) => {
        state.setChatHistory(msg.messages || []);
        renderChat(state.chat, state.userId);
    });

    voice.setOnStateChange((muted, deafened) => {
        state.setVoiceMuted(muted);
        state.setVoiceDeafened(deafened);
        updateVoiceControls(muted, deafened, state.inCall);
    });

    async function startSharing() {
        try {
            if (state.sharerId && state.sharerId !== state.userId) {
                showToast("Someone else is sharing. They must stop before you can share.", "error");
                updateShareControls(false, false);
                return;
            }
            const stream = await rtc.startSharing(state.users, state.userId);
            setLocalPreviewSource(stream);
            state.setIsSharing(true);
            updateShareControls(true);
            ws.send({ type: "start-sharing" });

            // Initiate connections to everyone currently in the room.
            state.users.forEach(u => {
                if (u.id !== state.userId) {
                    rtc.connectToNewUser(u.id);
                }
            });
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

    chatForm?.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = (chatInput?.value || "").trim();
        if (!text) return;
        chatInput.value = "";
        ws.send({ type: "chat", text, username: state.username });
    });
}