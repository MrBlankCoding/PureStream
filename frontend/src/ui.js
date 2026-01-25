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

export function renderUserList(users, sharerId, myUserId) {
    userListEl.innerHTML = "";

    users.forEach(user => {
        const isMe = user.id === myUserId;
        const isSharer = user.id === sharerId;
        const initial = user.username.charAt(0).toUpperCase();

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
}

const statusMessage = document.getElementById("status-message");

export function updateShareControls(isSharing) {
    if (isSharing) {
        shareScreenBtn.classList.add("hidden");
        stopShareBtn.classList.remove("hidden");
        if (statusMessage) statusMessage.textContent = "You are currently sharing";
    } else {
        shareScreenBtn.classList.remove("hidden");
        stopShareBtn.classList.add("hidden");
        if (statusMessage) statusMessage.textContent = "Waiting for someone to share...";
    }
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


