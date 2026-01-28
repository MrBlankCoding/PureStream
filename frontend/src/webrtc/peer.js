import { ConnectionState } from "./constants.js";
import { optimizeSDP, applyVideoEncoding } from "./utils.js";

export class Peer {
    constructor(remoteId, rtcConfig, { onSignal, onTrack, onConnectionStateChange }) {
        this.id = remoteId;
        this.pc = new RTCPeerConnection(rtcConfig);
        this.onSignal = onSignal;
        this.onTrack = onTrack;
        this.onConnectionStateChange = onConnectionStateChange;

        this._setupEventHandlers();
        console.log("[webrtc] Created peer connection for:", remoteId);
    }

    _setupEventHandlers() {
        // ICE candidates
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.onSignal(this.id, { candidate: event.candidate });
            } else {
                console.log("[webrtc] ICE gathering complete for:", this.id);
            }
        };

        // ICE connection state
        this.pc.oniceconnectionstatechange = () => {
            console.log("[webrtc] ICE connection state:", this.pc.iceConnectionState, "peer:", this.id);
            if (this.pc.iceConnectionState === 'failed') {
                console.warn("[webrtc] ICE connection failed for:", this.id);
                this.attemptIceRestart();
            }
        };

        // Track received
        this.pc.ontrack = (event) => {
            console.log("[webrtc] Received track:", event.track.kind, "from:", this.id);
            if (event.receiver?.playoutDelayHint !== undefined) {
                event.receiver.playoutDelayHint = 0;
            }

            event.track.enabled = true;

            // Debug logging
            event.track.onmute = () => console.warn('[webrtc] Remote track muted:', event.track.kind, "from:", this.id);
            event.track.onunmute = () => console.log('[webrtc] Remote track unmuted:', event.track.kind, "from:", this.id);

            if (this.onTrack) {
                const stream = event.streams?.[0] || new MediaStream([event.track]);
                this.onTrack(stream, this.id);
            }
        };

        this.pc.onconnectionstatechange = () => {
            const state = this.pc.connectionState;
            console.log("[webrtc] Connection state:", state, "peer:", this.id);
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(this.id, state);
            }
        };
    }

    addTrack(track, stream, maxBitrate) {
        const sender = this.pc.addTrack(track, stream);
        console.log("[webrtc] Added track to peer:", track.kind, "->", this.id);

        if (track.kind === 'video' && maxBitrate) {
            applyVideoEncoding(sender, maxBitrate);
        }
        return sender;
    }

    async createOffer(startWithIceRestart = false) {
        const options = {
            offerToReceiveAudio: false,
            offerToReceiveVideo: true,
            iceRestart: startWithIceRestart
        };

        const offer = await this.pc.createOffer(options);
        offer.sdp = optimizeSDP(offer.sdp);
        await this.pc.setLocalDescription(offer);
        return offer;
    }

    async createAnswer() {
        const answer = await this.pc.createAnswer();
        answer.sdp = optimizeSDP(answer.sdp);
        await this.pc.setLocalDescription(answer);
        return answer;
    }

    async setRemoteDescription(sdp) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    async addIceCandidate(candidate) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }

    async attemptIceRestart() {
        try {
            console.log("[webrtc] Attempting ICE restart for:", this.id);
            const offer = await this.createOffer(true);
            this.onSignal(this.id, { type: "offer", sdp: offer });
        } catch (error) {
            console.error("[webrtc] ICE restart failed:", error);
        }
    }

    getSenders() {
        return this.pc.getSenders();
    }

    close() {
        this.pc.close();
    }

    get connectionState() {
        return this.pc.connectionState;
    }
}
