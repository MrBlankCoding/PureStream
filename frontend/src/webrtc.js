import { ws } from "./websocket.js";

const RTC_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

export class WebRTCManager {
    constructor() {
        this._peers = new Map();
        this._localStream = null;
        this._onTrackCallback = null;
        this._onDisconnectCallback = null;
    }

    setOnTrack(callback) {
        this._onTrackCallback = callback;
    }

    setOnDisconnect(callback) {
        this._onDisconnectCallback = callback;
    }

    async startSharing(userList, myUserId) {
        if (!navigator.mediaDevices?.getDisplayMedia) {
            throw new Error("Screen sharing not supported");
        }

        this._localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 60, cursor: "always" },
            audio: { echoCancellation: false, noiseSuppression: false }
        });

        this._localStream.getVideoTracks()[0].onended = () => {
            this.stopSharing();
            if (this._onDisconnectCallback) {
                this._onDisconnectCallback("local");
            }
        };

        for (const user of userList) {
            if (user.id !== myUserId) {
                await this._initiateConnection(user.id);
            }
        }

        return this._localStream;
    }

    stopSharing() {
        if (this._localStream) {
            this._localStream.getTracks().forEach(t => t.stop());
            this._localStream = null;
        }
        this._closeAllPeers();
    }

    connectToNewUser(userId) {
        if (this._localStream && !this._peers.has(userId)) {
            this._initiateConnection(userId);
        }
    }

    async _initiateConnection(targetId) {
        const pc = this._createPeer(targetId);
        this._localStream.getTracks().forEach(t => pc.addTrack(t, this._localStream));

        const offer = await pc.createOffer();
        offer.sdp = this._mungeSDP(offer.sdp, 8000);
        await pc.setLocalDescription(offer);

        ws.send({
            type: "signal",
            target: targetId,
            data: { type: "offer", sdp: offer }
        });
    }

    async handleSignal(senderId, data) {
        if (data.type === "offer") {
            const pc = this._createPeer(senderId);
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

            const answer = await pc.createAnswer();
            answer.sdp = this._mungeSDP(answer.sdp, 8000);
            await pc.setLocalDescription(answer);

            ws.send({
                type: "signal",
                target: senderId,
                data: { type: "answer", sdp: answer }
            });
        } else if (data.type === "answer") {
            const pc = this._peers.get(senderId);
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            }
        } else if (data.candidate) {
            const pc = this._peers.get(senderId);
            if (pc) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        }
    }

    _createPeer(remoteId) {
        if (this._peers.has(remoteId)) {
            this._peers.get(remoteId).close();
        }

        const pc = new RTCPeerConnection(RTC_CONFIG);
        this._peers.set(remoteId, pc);

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                ws.send({
                    type: "signal",
                    target: remoteId,
                    data: { candidate: e.candidate }
                });
            }
        };

        pc.ontrack = (e) => {
            if (e.receiver?.playoutDelayHint !== undefined) {
                e.receiver.playoutDelayHint = 0;
            }
            if (this._onTrackCallback) {
                this._onTrackCallback(e.streams[0], remoteId);
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
                this._removePeer(remoteId);
                if (this._onDisconnectCallback) {
                    this._onDisconnectCallback(remoteId);
                }
            }
        };

        return pc;
    }

    _removePeer(id) {
        const pc = this._peers.get(id);
        if (pc) {
            pc.close();
            this._peers.delete(id);
        }
    }

    _closeAllPeers() {
        this._peers.forEach(pc => pc.close());
        this._peers.clear();
    }

    _mungeSDP(sdp, bitrateKbps) {
        const lines = sdp.split("\n");
        let videoLineIdx = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("m=video")) {
                videoLineIdx = i;
                break;
            }
        }

        if (videoLineIdx === -1) return sdp;

        let nextSection = lines.length;
        for (let i = videoLineIdx + 1; i < lines.length; i++) {
            if (lines[i].startsWith("m=")) {
                nextSection = i;
                break;
            }
        }

        const bandwidthLine = `b=AS:${bitrateKbps}`;
        let inserted = false;

        for (let i = videoLineIdx; i < nextSection; i++) {
            if (lines[i].startsWith("b=AS:")) {
                lines[i] = bandwidthLine;
                inserted = true;
                break;
            }
        }

        if (!inserted) {
            let insertAt = videoLineIdx + 1;
            for (let i = videoLineIdx + 1; i < nextSection; i++) {
                if (lines[i].startsWith("c=")) {
                    insertAt = i + 1;
                    break;
                }
            }
            lines.splice(insertAt, 0, bandwidthLine);
        }

        return lines.join("\n");
    }

    get isSharing() {
        return this._localStream !== null;
    }
}

export const rtc = new WebRTCManager();
