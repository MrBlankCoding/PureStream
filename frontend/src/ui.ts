import Toastify from "toastify-js";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { createIcons, icons } from "lucide";
import { whiteboard } from "./whiteboard";
import { state } from "./state";

const userListEl = document.getElementById("user-list") as HTMLElement;
const emptyState = document.getElementById("empty-state") as HTMLElement;
const remoteVideo = document.getElementById("remote-video") as HTMLVideoElement;
const shareScreenBtn = document.getElementById("share-screen-btn") as HTMLButtonElement;
const stopShareBtn = document.getElementById("stop-share-btn") as HTMLButtonElement;
const chatMessagesEl = document.getElementById("chat-messages") as HTMLElement;
const callControls = document.getElementById("call-controls");
const localPreview = document.getElementById("local-preview");
const localPreviewVideo = document.getElementById("local-preview-video") as HTMLVideoElement;
const whiteboardContainer = document.getElementById("whiteboard-container");
const startWhiteboardBtn = document.getElementById("start-whiteboard-btn") as HTMLButtonElement;
const stopWhiteboardBtn = document.getElementById("stop-whiteboard-btn") as HTMLButtonElement;


export function renderUserList(users: any[], sharerId: string | null, myUserId: string, voicePeers = new Map()) {
    if (!userListEl) return;
    userListEl.innerHTML = "";

    users.forEach(user => {
        const isMe = user.id === myUserId;
        const isSharer = user.id === sharerId;
        const initial = user.username.charAt(0).toUpperCase();
        const voiceState = voicePeers.get(user.id) || { muted: user.muted, deafened: user.deafened };

        const div = document.createElement("div");
        div.className = twMerge(
            clsx(
                "flex items-center gap-3 p-2 rounded-lg transition-colors",
                isMe ? "bg-slate-800/50" : "hover:bg-slate-800"
            )
        );

        const avatarClasses = twMerge(
            clsx(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white",
                isSharer ? "bg-red-600 ring-2 ring-red-400" : (isMe ? "bg-blue-600" : "bg-slate-600")
            )
        );

        const micIcon = voiceState.muted
            ? '<i data-lucide="mic-off" class="w-3.5 h-3.5 text-red-400"></i>'
            : '<i data-lucide="mic" class="w-3.5 h-3.5 text-emerald-400"></i>';
        const speakerIcon = voiceState.deafened
            ? '<i data-lucide="volume-off" class="w-3.5 h-3.5 text-red-400"></i>'
            : '';
        const callIcon = user.inCall
            ? '<i data-lucide="phone" class="w-3.5 h-3.5 text-emerald-300"></i>'
            : '';

        div.innerHTML = `
            <div class="relative">
                <div class="${avatarClasses}">
                    ${initial}
                </div>
                ${isSharer ? '<div class="absolute -bottom-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center"><i data-lucide="circle" class="w-2.5 h-2.5 text-white fill-current"></i></div>' : ''}
            </div>
            <div class="flex flex-col flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-slate-200 truncate">${user.username}${isMe ? " (You)" : ""}</span>
                    ${isSharer ? '<span class="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded uppercase animate-pulse">Live</span>' : ''}
                </div>
            </div>
            <div class="flex items-center gap-1">
                ${callIcon}
                ${micIcon}
                ${speakerIcon}
            </div>
        `;
        userListEl.appendChild(div);
    });

    createIcons({ icons });
}

export function updateVideoStage(hasVideo: boolean, sharerName: string | null, isWhiteboarding: boolean = false) {
    emptyState.classList.add("hidden");
    remoteVideo.classList.add("hidden");
    if (whiteboardContainer) whiteboardContainer.classList.add("hidden");
    remoteVideo.pause();

    if (isWhiteboarding) {
        if (whiteboardContainer) {
            whiteboardContainer.classList.remove("hidden");
            void whiteboardContainer.offsetWidth;
            whiteboard.init("whiteboard-container");
        }
    } else if (hasVideo && sharerName) {
        remoteVideo.classList.remove("hidden");
        remoteVideo.play().catch(() => { });
    } else {
        emptyState.classList.remove("hidden");
    }
}


export function setVideoSource(stream: MediaStream | null) {
    if (!remoteVideo) return;
    remoteVideo.srcObject = stream;
    if (!stream) {
        try { remoteVideo.pause(); } catch (e) { /* ignore */ }
        remoteVideo.srcObject = null;
        remoteVideo.style.display = 'none';
        return;
    }

    remoteVideo.style.display = 'block';
    const playVideo = () => {
        remoteVideo.play().catch(err => {
            console.warn('[ui] Failed to play remote video:', err);
        });
    };

    if (remoteVideo.readyState >= 1) { // HAVE_METADATA
        playVideo();
    } else {
        remoteVideo.addEventListener('loadedmetadata', playVideo, { once: true });
    }
}

const statusMessage = document.getElementById("status-message");

export function setConnecting(isConnecting: boolean) {
    if (statusMessage) {
        if (isConnecting) {
            statusMessage.innerHTML = `
                <div class="flex items-center justify-center gap-2">
                    <div class="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                    <span>Connecting to stream...</span>
                </div>
            `;
            shareScreenBtn.classList.add("hidden");
        } else {
            // keep empty?
        }
    }
}

export function updateShareControls(isSharing: boolean, canShare = true) {
    if (isSharing) {
        shareScreenBtn.classList.add("hidden");
        stopShareBtn.classList.remove("hidden");
        if (statusMessage) statusMessage.textContent = "You are currently sharing";
        if (localPreview) localPreview.classList.remove("hidden");
    } else {
        if (canShare) {
            shareScreenBtn.classList.remove("hidden");
            shareScreenBtn.disabled = false;
            shareScreenBtn.classList.remove("opacity-50", "cursor-not-allowed");
            if (statusMessage) statusMessage.textContent = "Waiting for someone to share...";
        } else {
            shareScreenBtn.classList.add("hidden");
            shareScreenBtn.disabled = true;
            shareScreenBtn.classList.add("opacity-50", "cursor-not-allowed");
            if (statusMessage) statusMessage.textContent = "Someone else is sharing";
        }

        stopShareBtn.classList.add("hidden");
        if (localPreview) localPreview.classList.add("hidden");
        if (localPreviewVideo) localPreviewVideo.srcObject = null;
    }
}

export function setLocalPreviewSource(stream: MediaStream) {
    if (!localPreviewVideo) return;
    localPreviewVideo.srcObject = stream;
    localPreviewVideo.play?.().catch(() => { });
}

export function showToast(msg: string, type = "info") {
    const isError = type === "error";
    Toastify({
        text: msg,
        duration: 3000,
        gravity: "top",
        position: "right",
        stopOnFocus: true,
        className: twMerge(
            clsx(
                "rounded-lg shadow-lg text-sm font-semibold flex items-center gap-2",
                isError ? "bg-red-600" : "bg-blue-600"
            )
        ),
    }).showToast();
}

const muteBtn = document.getElementById("mute-btn");
const deafenBtn = document.getElementById("deafen-btn");

export function updateVoiceControls(muted: boolean, deafened: boolean, inCall = true) {
    if (callControls) {
        callControls.classList.toggle("hidden", !inCall);
    }
    if (!inCall) {
        return;
    }
    if (muteBtn) {
        const icon = muteBtn.querySelector("i");
        if (muted) {
            muteBtn.classList.add("bg-red-500/20", "text-red-400");
            muteBtn.classList.remove("bg-slate-800", "text-slate-300");
            if (icon) icon.setAttribute("data-lucide", "mic-off");
        } else {
            muteBtn.classList.remove("bg-red-500/20", "text-red-400");
            muteBtn.classList.add("bg-slate-800", "text-slate-300");
            if (icon) icon.setAttribute("data-lucide", "mic");
        }
    }
    if (deafenBtn) {
        const icon = deafenBtn.querySelector("i");
        if (deafened) {
            deafenBtn.classList.add("bg-red-500/20", "text-red-400");
            deafenBtn.classList.remove("bg-slate-800", "text-slate-300");
            if (icon) icon.setAttribute("data-lucide", "volume-off");
        } else {
            deafenBtn.classList.remove("bg-red-500/20", "text-red-400");
            deafenBtn.classList.add("bg-slate-800", "text-slate-300");
            if (icon) icon.setAttribute("data-lucide", "volume-2");
        }
    }
    createIcons({ icons });
}

export function renderChat(messages: any[], selfId: string) {
    if (!chatMessagesEl) return;
    chatMessagesEl.innerHTML = "";
    messages.slice(-200).forEach(msg => {
        const isMe = msg.userId === selfId;
        const row = document.createElement("div");
        row.className = "flex flex-col gap-1";
        const header = document.createElement("div");
        header.className = "flex items-center gap-2 text-xs text-slate-400";
        const nameSpan = document.createElement("span");
        nameSpan.textContent = `${msg.username}${isMe ? " (You)" : ""}`;
        const timeSpan = document.createElement("span");
        const date = new Date(msg.timestamp * 1000);
        timeSpan.textContent = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        header.appendChild(nameSpan);
        header.appendChild(timeSpan);

        const body = document.createElement("div");
        body.className = twMerge(clsx(
            "rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
            isMe ? "bg-blue-600/20 text-blue-100 border border-blue-500/40 self-end" : "bg-slate-800 text-slate-100 border border-slate-700"
        ));
        body.textContent = msg.text;

        row.appendChild(header);
        row.appendChild(body);
        chatMessagesEl.appendChild(row);
    });
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

export function setupUIListeners() {
    if (startWhiteboardBtn) {
        startWhiteboardBtn.addEventListener('click', () => {
            if (state.isSharing) {
                // Confirm or just stop sharing?
                // For now, let's just stop sharing and start whiteboard
                document.dispatchEvent(new CustomEvent('stop-sharing')); // This needs to be handled in main/state
            }
            whiteboard.start();
            updateWhiteboardControls(true);
        });
    }

    if (stopWhiteboardBtn) {
        stopWhiteboardBtn.addEventListener('click', () => {
            whiteboard.stop();
            updateWhiteboardControls(false);
        });
    }
}

export function updateWhiteboardControls(isWhiteboarding: boolean) {
    if (startWhiteboardBtn) startWhiteboardBtn.classList.toggle('hidden', isWhiteboarding);
    if (stopWhiteboardBtn) stopWhiteboardBtn.classList.toggle('hidden', !isWhiteboarding);
    if (shareScreenBtn) {
        shareScreenBtn.disabled = isWhiteboarding;
        shareScreenBtn.classList.toggle('opacity-50', isWhiteboarding);
        shareScreenBtn.classList.toggle('cursor-not-allowed', isWhiteboarding);
    }
}
