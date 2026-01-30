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
    renderChat,
    setConnecting
} from "./ui.js";
import { createIcons, icons } from "lucide";

createIcons({ icons });

let connectionTimeout: ReturnType<typeof setTimeout> | null = null;

const copyRoomIdBtn = document.getElementById("copy-room-id") as HTMLButtonElement;
const sidebar = document.getElementById("sidebar") as HTMLElement;
const chatSidebar = document.getElementById("chat-sidebar") as HTMLElement;
const mobileParticipantsBtn = document.getElementById("mobile-participants-btn") as HTMLButtonElement;
const mobileChatBtn = document.getElementById("mobile-chat-btn") as HTMLButtonElement;
const closeSidebarBtn = document.getElementById("close-sidebar-btn") as HTMLButtonElement;
const closeChatBtn = document.getElementById("close-chat-btn") as HTMLButtonElement;
const leaveBtn = document.getElementById("leave-btn") as HTMLButtonElement;
const shareScreenBtn = document.getElementById("share-screen-btn") as HTMLButtonElement;
const stopShareBtn = document.getElementById("stop-share-btn") as HTMLButtonElement;
const fullscreenBtn = document.getElementById("fullscreen-btn") as HTMLButtonElement;
const muteBtn = document.getElementById("mute-btn") as HTMLButtonElement;
const deafenBtn = document.getElementById("deafen-btn") as HTMLButtonElement;
const videoStage = document.getElementById("video-stage") as HTMLElement;
const joinCallBtn = document.getElementById("join-call-btn") as HTMLButtonElement;
const chatForm = document.getElementById("chat-form") as HTMLFormElement;
const chatInput = document.getElementById("chat-input") as HTMLInputElement;
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("room");
const username = urlParams.get("username");

if (!roomId || !username) {
    window.location.href = "/";
} else {
    initViewer(roomId, username);
}

function initViewer(roomId: string, username: string) {
    state.setUsername(username);
    state.setRoomId(roomId);

    const roomIdDisplay = document.getElementById("room-id-display");
    if (roomIdDisplay) roomIdDisplay.textContent = roomId;

    const myUsernameDisplay = document.getElementById("my-username");
    if (myUsernameDisplay) myUsernameDisplay.textContent = username;

    const myAvatar = document.getElementById("my-avatar");
    if (myAvatar) myAvatar.textContent = username.charAt(0).toUpperCase();

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

mobileParticipantsBtn.onclick = () => {
    sidebar.classList.remove("-translate-x-full");
    chatSidebar.classList.add("translate-x-full");
};

mobileChatBtn.onclick = () => {
    chatSidebar.classList.remove("translate-x-full");
    sidebar.classList.add("-translate-x-full");
};

closeSidebarBtn.onclick = () => {
    sidebar.classList.add("-translate-x-full");
};

closeChatBtn.onclick = () => {
    chatSidebar.classList.add("translate-x-full");
};

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

        const joinSpan = joinCallBtn.querySelector("span");
        if (joinSpan) {
            joinSpan.classList.remove("md:inline");
            joinSpan.classList.add("md:inline");
            joinSpan.textContent = "Join Call";
        }

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

        const joinSpan = joinCallBtn.querySelector("span");
        if (joinSpan) joinSpan.textContent = "Leave Call";

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
    if (!icon) return;

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
    if (!state.roomId) return;
    const url = `${window.location.origin}/?room=${state.roomId}`;
    navigator.clipboard.writeText(url);
    showToast("Room Link copied!");
};

function initConnection() {
    ws.on("open", () => {
        ws.send({ type: "join", username: state.username });
    });

    ws.on("user-list", (msg: any) => {
        state.setUsers(msg.users);
        msg.users.forEach((u: any) => {
            if (u.id !== state.userId) {
                state.setVoicePeerState(u.id, u.muted, u.deafened);
            }
        });
        renderUserList(msg.users, state.sharerId, state.userId, state.voicePeers);

        if (voice.isActive) {
            msg.users.filter((u: any) => u.inCall && u.id !== state.userId).forEach((u: any) => voice.connectToUser(u.id));
        }
    });

    ws.on("sharer-changed", (msg: any) => {
        state.setSharer(msg.sharerId, msg.sharerName);
        renderUserList(state.users, msg.sharerId, state.userId, state.voicePeers);

        const someoneElseSharing = Boolean(msg.sharerId && msg.sharerId !== state.userId);
        updateShareControls(state.isSharing, !someoneElseSharing);

        if (connectionTimeout) clearTimeout(connectionTimeout);

        if (msg.sharerId && msg.sharerId !== state.userId) {
            setConnecting(true);
            rtc.connectToSharer(msg.sharerId);

            connectionTimeout = setTimeout(() => {
                const peerState = rtc.getPeerState(msg.sharerId);
                console.log("[viewer] Connection watchdog check. State:", peerState);
                if (peerState !== "connected" && peerState !== "completed" as string) {
                    console.log("[viewer] Requesting offer from sharer:", msg.sharerId);
                    ws.send({
                        type: "signal",
                        target: msg.sharerId,
                        data: { type: "request-offer" }
                    });
                }
            }, 2000);

        } else if (!msg.sharerId) {
            setConnecting(false);
            updateVideoStage(false, null);
        } else {
            setConnecting(false);
        }
    });

    ws.on("signal", async (msg: any) => {
        await rtc.handleSignal(msg.sender, msg.data);
    });

    ws.on("close", () => {
        showToast("Connection lost, reconnecting...", "error");
    });

    rtc.setOnTrack((stream, _senderId) => {
        if (connectionTimeout) clearTimeout(connectionTimeout);
        setConnecting(false);
        setVideoSource(stream);
        updateVideoStage(true, state.sharerName || "Someone");
    });

    rtc.setOnDisconnect((id) => {
        if (id === "local") {
            ws.send({ type: "stop-sharing" });
            state.setIsSharing(false);
            updateShareControls(false, state.sharerId ? state.sharerId === state.userId : true);
        } else if (id === "remote") {
            // Remote sharer stopped or track ended: clear UI
            state.setIsSharing(false);
            updateShareControls(false, state.sharerId ? state.sharerId === state.userId : true);
            updateVideoStage(false, null);
            setVideoSource(null);
        }
    });

    ws.on("voice-signal", async (msg: any) => {
        await voice.handleSignal(msg.sender, msg.data);
    });

    ws.on("voice-state", (msg: any) => {
        state.setVoicePeerState(msg.userId, msg.muted, msg.deafened);
        renderUserList(state.users, state.sharerId, state.userId, state.voicePeers);
    });

    ws.on("call-state", (msg: any) => {
        const updated = state.users.map(u => u.id === msg.userId ? { ...u, inCall: msg.inCall } : u);
        state.setUsers(updated);

        if (msg.userId === state.userId) {
            state.setInCall(msg.inCall);
            updateVoiceControls(state.voiceMuted, state.voiceDeafened, msg.inCall);
        } else if (state.inCall && msg.inCall) {
            console.log("[viewer] User joined call, checking connection:", msg.userId);
            voice.connectToUser(msg.userId);
        }

        renderUserList(state.users, state.sharerId, state.userId, state.voicePeers);
    });

    ws.on("chat", (msg: any) => {
        state.appendChatMessage(msg);
        renderChat(state.chat, state.userId);
    });

    ws.on("chat-history", (msg: any) => {
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

    ws.connect(state.roomId!, state.userId);

    chatForm?.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = (chatInput?.value || "").trim();
        if (!text) return;
        chatInput.value = "";
        ws.send({ type: "chat", text, username: state.username });
    });
}