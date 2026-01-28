import Toastify from "toastify-js";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { createIcons, icons } from "lucide/dist/cjs/lucide.js";

const userListEl = document.getElementById("user-list");
const emptyState = document.getElementById("empty-state");
const remoteVideo = document.getElementById("remote-video");
const streamTag = document.getElementById("stream-tag");
const sharerBanner = document.getElementById("sharer-banner");
const sharerNameDisplay = document.getElementById("sharer-name-display");
const shareScreenBtn = document.getElementById("share-screen-btn");
const stopShareBtn = document.getElementById("stop-share-btn");
const chatMessagesEl = document.getElementById("chat-messages");
const callControls = document.getElementById("call-controls");
const localPreview = document.getElementById("local-preview");
const localPreviewVideo = document.getElementById("local-preview-video");

export function renderUserList(users, sharerId, myUserId, voicePeers = new Map()) {
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

export function updateVideoStage(hasVideo, sharerName) {
    if (hasVideo && sharerName) {
        emptyState.classList.add("hidden");
        remoteVideo.classList.remove("hidden");
        if (streamTag) streamTag.classList.remove("hidden");
        if (sharerBanner) sharerBanner.classList.remove("hidden");
        if (sharerNameDisplay) sharerNameDisplay.textContent = sharerName;
    } else {
        emptyState.classList.remove("hidden");
        remoteVideo.classList.add("hidden");
        if (streamTag) streamTag.classList.add("hidden");
        if (sharerBanner) sharerBanner.classList.add("hidden");
    }
}

export function setVideoSource(stream) {
    remoteVideo.srcObject = stream;
    if (remoteVideo) {
        remoteVideo.style.display = 'block';
        const playVideo = () => {
            remoteVideo.play().catch(err => {
                console.warn('[ui] Failed to play remote video:', err);
            });
        };
        
        if (remoteVideo.readyState >= 1) {
            playVideo();
        } else {
            remoteVideo.addEventListener('loadedmetadata', playVideo, { once: true });
        }
    }
}

const statusMessage = document.getElementById("status-message");

export function updateShareControls(isSharing, canShare = true) {
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

export function setLocalPreviewSource(stream) {
    if (!localPreviewVideo) return;
    localPreviewVideo.srcObject = stream;
    localPreviewVideo.play?.().catch(() => { });
}

export function showToast(msg, type = "info") {
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

export function updateVoiceControls(muted, deafened, inCall = true) {
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

export function renderChat(messages, selfId) {
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
