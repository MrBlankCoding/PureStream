import { ws } from "./websocket.js";

const RTC_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

type StateChangeCallback = (muted: boolean, deafened: boolean) => void;

export class VoiceChatManager {
    private _peers: Map<string, RTCPeerConnection>;
    private _pendingCandidates: Map<string, RTCIceCandidateInit[]>;
    private _localStream: MediaStream | null;
    private _audioElements: Map<string, HTMLAudioElement>;
    private _muted: boolean;
    private _deafened: boolean;
    private _onStateChange: StateChangeCallback | null;
    private _myUserId: string | null;

    constructor() {
        this._peers = new Map();
        this._pendingCandidates = new Map();
        this._localStream = null;
        this._audioElements = new Map();
        this._muted = false;
        this._deafened = false;
        this._onStateChange = null;
        this._myUserId = null;
    }

    setOnStateChange(callback: StateChangeCallback): void {
        this._onStateChange = callback;
    }

    async start(userList: any[], myUserId: string): Promise<boolean> {
        this._myUserId = myUserId;
        try {
            this._localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            for (const user of userList) {
                if (user.id !== myUserId) {
                    this.connectToUser(user.id);
                }
            }

            return true;
        } catch (err) {
            console.error("Failed to get microphone:", err);
            return false;
        }
    }

    stop(): void {
        if (this._localStream) {
            this._localStream.getTracks().forEach(t => t.stop());
            this._localStream = null;
        }
        this._closeAllPeers();
        this._audioElements.forEach(audio => audio.remove());
        this._audioElements.clear();
        this._myUserId = null;
    }

    connectToUser(targetId: string): void {
        if (this._localStream && !this._peers.has(targetId)) {
            if (this._myUserId && this._myUserId > targetId) {
                this._initiateConnection(targetId);
            }
        }
    }

    private async _initiateConnection(targetId: string): Promise<void> {
        if (!this._localStream) return;

        const pc = this._createPeer(targetId);
        this._localStream.getTracks().forEach(t => pc.addTrack(t, this._localStream!));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        ws.send({
            type: "voice-signal",
            target: targetId,
            data: { type: "offer", sdp: offer }
        });
    }

    async handleSignal(senderId: string, data: any): Promise<void> {
        if (data.type === "offer") {
            if (!this._localStream) return;

            const pc = this._createPeer(senderId);
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const queued = this._pendingCandidates.get(senderId) || [];
            for (const candidate of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            this._pendingCandidates.delete(senderId);

            this._localStream.getTracks().forEach(t => pc.addTrack(t, this._localStream!));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            ws.send({
                type: "voice-signal",
                target: senderId,
                data: { type: "answer", sdp: answer }
            });
        } else if (data.type === "answer") {
            const pc = this._peers.get(senderId);
            if (pc && pc.signalingState === "have-local-offer") {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

                const queued = this._pendingCandidates.get(senderId) || [];
                for (const candidate of queued) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                this._pendingCandidates.delete(senderId);
            }
        } else if (data.candidate) {
            const pc = this._peers.get(senderId);
            if (!pc) return;

            if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
                if (!this._pendingCandidates.has(senderId)) {
                    this._pendingCandidates.set(senderId, []);
                }
                this._pendingCandidates.get(senderId)!.push(data.candidate);
            }
        }
    }

    private _createPeer(remoteId: string): RTCPeerConnection {
        if (this._peers.has(remoteId)) {
            this._peers.get(remoteId)!.close();
        }

        const pc = new RTCPeerConnection(RTC_CONFIG);
        this._peers.set(remoteId, pc);

        pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
            if (e.candidate) {
                ws.send({
                    type: "voice-signal",
                    target: remoteId,
                    data: { candidate: e.candidate }
                });
            }
        };

        pc.ontrack = (e: RTCTrackEvent) => {
            let audio = this._audioElements.get(remoteId);
            if (!audio) {
                audio = document.createElement("audio");
                audio.autoplay = true;
                audio.id = `voice-audio-${remoteId}`;
                document.body.appendChild(audio);
                this._audioElements.set(remoteId, audio);
            }
            audio.srcObject = e.streams[0];
            audio.muted = this._deafened;
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
                this._removePeer(remoteId);
            }
        };

        return pc;
    }

    private _removePeer(id: string): void {
        const pc = this._peers.get(id);
        if (pc) {
            pc.close();
            this._peers.delete(id);
        }
        this._pendingCandidates.delete(id);
        const audio = this._audioElements.get(id);
        if (audio) {
            audio.remove();
            this._audioElements.delete(id);
        }
    }

    private _closeAllPeers(): void {
        this._peers.forEach(pc => pc.close());
        this._peers.clear();
    }

    setMuted(muted: boolean): void {
        this._muted = muted;
        if (this._localStream) {
            this._localStream.getAudioTracks().forEach(t => t.enabled = !muted);
        }
        this._broadcastState();
    }

    setDeafened(deafened: boolean): void {
        this._deafened = deafened;
        this._audioElements.forEach(audio => audio.muted = deafened);
        this._broadcastState();
    }

    private _broadcastState(): void {
        ws.send({
            type: "voice-state",
            muted: this._muted,
            deafened: this._deafened
        });
        if (this._onStateChange) {
            this._onStateChange(this._muted, this._deafened);
        }
    }

    get isMuted(): boolean { return this._muted; }
    get isDeafened(): boolean { return this._deafened; }
    get isActive(): boolean { return this._localStream !== null; }
}

export const voice = new VoiceChatManager();
