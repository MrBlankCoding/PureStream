import { ws } from "../websocket.js";
import { ConnectionState, DEFAULT_CONFIG } from "./constants.js";
import { getIceServers } from "./config.js";
import { Peer } from "./peer.js";

export class WebRTCManager {
    constructor() {
        this._peers = new Map();
        this._peerStates = new Map();
        this._pendingCandidates = new Map();
        this._localStream = null;
        this._onTrackCallback = null;
        this._onDisconnectCallback = null;
        this._iceServers = [];
        this._isInitialized = false;
        this._initPromise = this._initializeIceServers();
        this._config = { ...DEFAULT_CONFIG };
    }

    async _initializeIceServers() {
        try {
            this._iceServers = await getIceServers();
            this._isInitialized = true;
            console.log("[webrtc] ICE servers initialized:", this._iceServers.length, "servers");
        } catch (error) {
            console.error("[webrtc] Failed to initialize ICE servers:", error);
            this._iceServers = [
                { urls: "stun:stun.l.google.com:19302" }
            ];
            this._isInitialized = true;
        }
    }

    async _ensureInitialized() {
        if (!this._isInitialized) {
            await this._initPromise;
        }
    }

    setOnTrack(callback) {
        this._onTrackCallback = callback;
    }

    setOnDisconnect(callback) {
        this._onDisconnectCallback = callback;
    }

    async startSharing(userList, myUserId) {
        await this._ensureInitialized();

        if (!navigator.mediaDevices?.getDisplayMedia) {
            throw new Error("Screen sharing not supported in this browser");
        }

        try {
            this._localStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: { ideal: 60, max: 60 },
                    cursor: "always",
                    displaySurface: "monitor" // Prefer full screen
                },
                audio: false
            });

            const videoTrack = this._localStream.getVideoTracks()[0];
            if (!videoTrack) {
                this.stopSharing();
                throw new Error("No video track available from screen capture");
            }

            // Setup track event handlers
            videoTrack.addEventListener('ended', () => {
                console.log("[webrtc] Screen sharing ended by user");
                this.stopSharing();
                if (this._onDisconnectCallback) {
                    this._onDisconnectCallback("local");
                }
            });

            videoTrack.addEventListener('mute', () => {
                console.warn("[webrtc] Local video track muted");
            });

            videoTrack.addEventListener('unmute', () => {
                console.log("[webrtc] Local video track unmuted");
            });

            console.log("[webrtc] Screen sharing started successfully");
            return this._localStream;

        } catch (error) {
            console.error("[webrtc] Failed to start screen sharing:", error);
            this.stopSharing();
            throw error;
        }
    }

    stopSharing() {
        if (this._localStream) {
            this._localStream.getTracks().forEach(track => {
                track.stop();
                console.log("[webrtc] Stopped track:", track.kind);
            });
            this._localStream = null;
        }
        this._closeAllPeers();
        console.log("[webrtc] Screen sharing stopped");
    }

    async connectToNewUser(userId) {
        await this._ensureInitialized();

        if (this._peers.has(userId)) {
            const peer = this._peers.get(userId);
            if (peer.connectionState === "failed" || peer.connectionState === "closed") {
                console.log("[webrtc] Removing failed/closed peer before reconnect:", userId);
                this._removePeer(userId);
            }
        }

        if (this._localStream && !this._peers.has(userId)) {
            console.log("[webrtc] Connecting to new user:", userId);
            await this._initiateConnection(userId);
        }
    }

    async connectToSharer(sharerId) {
        await this._ensureInitialized();
        this._getOrCreatePeer(sharerId);
        console.log("[webrtc] Ready to receive from sharer:", sharerId);
    }

    async _initiateConnection(targetId) {
        try {
            const peer = this._getOrCreatePeer(targetId);

            // Add local tracks
            if (this._localStream) {
                const senders = peer.getSenders();
                const existingTracks = new Set(senders.map(s => s.track).filter(Boolean));

                for (const track of this._localStream.getTracks()) {
                    if (!existingTracks.has(track)) {
                        peer.addTrack(track, this._localStream, this._config.maxBitrate);
                    }
                }
            }

            // Create and send offer
            const offer = await peer.createOffer();

            this._sendSignal(targetId, {
                type: "offer",
                sdp: offer
            });

            console.log("[webrtc] Sent offer to:", targetId);

        } catch (error) {
            console.error("[webrtc] Failed to initiate connection:", error);
            this._removePeer(targetId);
            if (this._onDisconnectCallback) {
                this._onDisconnectCallback(targetId);
            }
            throw error;
        }
    }

    async handleSignal(senderId, data) {
        try {
            await this._ensureInitialized();

            if (data.type === "offer") {
                await this._handleOffer(senderId, data);
            } else if (data.type === "answer") {
                await this._handleAnswer(senderId, data);
            } else if (data.candidate) {
                await this._handleCandidate(senderId, data);
            } else if (data.type === "request-offer") {
                console.log("[webrtc] Received offer request from:", senderId);
                if (this.isSharing) {
                    await this.connectToNewUser(senderId);
                }
            }
        } catch (error) {
            console.error("[webrtc] Error handling signal from", senderId, ":", error);
        }
    }

    async _handleOffer(senderId, data) {
        const peer = this._getOrCreatePeer(senderId);

        await peer.setRemoteDescription(data.sdp);
        console.log("[webrtc] Set remote description (offer) from:", senderId);
        await this._processQueuedCandidates(senderId, peer);
        if (this._localStream) {
            const senders = peer.getSenders();
            const existingTracks = new Set(senders.map(s => s.track).filter(Boolean));

            for (const track of this._localStream.getTracks()) {
                if (!existingTracks.has(track)) {
                    peer.addTrack(track, this._localStream);
                }
            }
        }
        const answer = await peer.createAnswer();

        this._sendSignal(senderId, {
            type: "answer",
            sdp: answer
        });

        console.log("[webrtc] Sent answer to:", senderId);
    }

    async _handleAnswer(senderId, data) {
        const peer = this._peers.get(senderId);
        if (!peer) {
            console.warn("[webrtc] Received answer for non-existent peer:", senderId);
            return;
        }

        await peer.setRemoteDescription(data.sdp);
        console.log("[webrtc] Set remote description (answer) from:", senderId);

        // Process queued ICE candidates
        await this._processQueuedCandidates(senderId, peer);
    }

    async _handleCandidate(senderId, data) {
        const peer = this._peers.get(senderId);
        if (!peer) {
            console.warn("[webrtc] Received candidate for non-existent peer:", senderId);
            return;
        }

        const candidateObj = typeof data.candidate === "string"
            ? {
                candidate: data.candidate,
                sdpMid: data.sdpMid,
                sdpMLineIndex: data.sdpMLineIndex
            }
            : data.candidate;

        if (peer.pc.remoteDescription) {
            try {
                await peer.addIceCandidate(candidateObj);
            } catch (error) {
                console.warn("[webrtc] Failed to add ICE candidate:", error);
            }
        } else {
            // Queue candidate for later
            if (!this._pendingCandidates.has(senderId)) {
                this._pendingCandidates.set(senderId, []);
            }
            this._pendingCandidates.get(senderId).push(candidateObj);
        }
    }

    async _processQueuedCandidates(peerId, peer) {
        const queued = this._pendingCandidates.get(peerId);
        if (queued && queued.length > 0) {
            console.log("[webrtc] Processing", queued.length, "queued candidates for:", peerId);

            for (const candidate of queued) {
                try {
                    await peer.addIceCandidate(candidate);
                } catch (error) {
                    console.warn("[webrtc] Failed to add queued candidate:", error);
                }
            }

            this._pendingCandidates.delete(peerId);
        }
    }

    _getOrCreatePeer(remoteId) {
        if (this._peers.has(remoteId)) {
            return this._peers.get(remoteId);
        }

        const rtcConfig = {
            iceServers: this._iceServers,
            iceTransportPolicy: this._config.iceTransportPolicy,
            iceCandidatePoolSize: this._config.iceCandidatePoolSize,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };

        const peer = new Peer(remoteId, rtcConfig, {
            onSignal: (targetId, data) => this._sendSignal(targetId, data),
            onTrack: (stream, id) => {
                if (this._onTrackCallback) this._onTrackCallback(stream, id);
            },
            onConnectionStateChange: (id, state) => this._handleConnectionStateChange(id, state)
        });

        this._peers.set(remoteId, peer);
        this._peerStates.set(remoteId, ConnectionState.NEW);

        return peer;
    }

    _handleConnectionStateChange(remoteId, state) {
        this._peerStates.set(remoteId, state);

        if (state === "disconnected") {
            console.warn("[webrtc] Peer disconnected:", remoteId);
            // Give it time to reconnect
            setTimeout(() => {
                const peer = this._peers.get(remoteId);
                if (peer && peer.connectionState === "disconnected") {
                    this._removePeer(remoteId);
                    if (this._onDisconnectCallback) {
                        this._onDisconnectCallback(remoteId);
                    }
                }
            }, 5000);
        } else if (state === "failed") {
            console.error("[webrtc] Peer connection failed:", remoteId);
            this._removePeer(remoteId);
            if (this._onDisconnectCallback) {
                this._onDisconnectCallback(remoteId);
            }
        }
    }

    _sendSignal(target, data) {
        ws.send({
            type: "signal",
            target: target,
            data: data
        });
    }

    _removePeer(id) {
        const peer = this._peers.get(id);
        if (peer) {
            peer.close();
            this._peers.delete(id);
            console.log("[webrtc] Removed peer:", id);
        }
        this._peerStates.delete(id);
        this._pendingCandidates.delete(id);
    }

    _closeAllPeers() {
        console.log("[webrtc] Closing all", this._peers.size, "peer connections");
        this._peers.forEach((peer, id) => {
            peer.close();
            console.log("[webrtc] Closed peer:", id);
        });
        this._peers.clear();
        this._peerStates.clear();
        this._pendingCandidates.clear();
    }

    get isSharing() {
        return this._localStream !== null;
    }

    get activePeerCount() {
        return this._peers.size;
    }

    get connectedPeers() {
        return Array.from(this._peers.keys());
    }

    getPeerState(peerId) {
        return this._peerStates.get(peerId) || ConnectionState.CLOSED;
    }
}

export const rtc = new WebRTCManager();
