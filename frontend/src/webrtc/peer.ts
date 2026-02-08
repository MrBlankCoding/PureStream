import { optimizeSDP, applyVideoEncoding } from "./utils.js";

type SignalCallback = (id: string, data: any) => void;
type TrackCallback = (stream: MediaStream, id: string) => void;
type ConnectionStateCallback = (id: string, state: RTCPeerConnectionState) => void;

interface PeerCallbacks {
    onSignal: SignalCallback;
    onTrack?: TrackCallback;
    onConnectionStateChange?: ConnectionStateCallback;
}

export class Peer {
    public id: string;
    public pc: RTCPeerConnection;
    public onSignal: SignalCallback;
    public onTrack?: TrackCallback;
    public onConnectionStateChange?: ConnectionStateCallback;

    constructor(remoteId: string, rtcConfig: RTCConfiguration, { onSignal, onTrack, onConnectionStateChange }: PeerCallbacks) {
        this.id = remoteId;
        this.pc = new RTCPeerConnection(rtcConfig);
        this.onSignal = onSignal;
        this.onTrack = onTrack;
        this.onConnectionStateChange = onConnectionStateChange;

        this._setupEventHandlers();
        console.log("[webrtc] Created peer connection for:", remoteId);
    }

    private _setupEventHandlers(): void {
        // ICE candidates
        this.pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
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
        this.pc.ontrack = (event: RTCTrackEvent) => {
            console.log("[webrtc] Received track:", event.track.kind, "from:", this.id);

            // Fix playoutDelayHint type issue if needed, though standard types might not have it yet.
            // Using type assertion if needed.
            if ((event.receiver as any).playoutDelayHint !== undefined) {
                (event.receiver as any).playoutDelayHint = 0;
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

    addTrack(track: MediaStreamTrack, stream: MediaStream, maxBitrate?: number): RTCRtpSender {
        const sender = this.pc.addTrack(track, stream);
        console.log("[webrtc] Added track to peer:", track.kind, "->", this.id);

        if (track.kind === 'video' && maxBitrate) {
            applyVideoEncoding(sender, maxBitrate);
        }
        return sender;
    }

    async createOffer(startWithIceRestart = false): Promise<RTCSessionDescriptionInit> {
        const options: RTCOfferOptions = {
            offerToReceiveAudio: false,
            offerToReceiveVideo: true,
            iceRestart: startWithIceRestart
        };

        const offer = await this.pc.createOffer(options);
        // Assuming optimizeSDP returns string
        if (offer.sdp) {
            offer.sdp = optimizeSDP(offer.sdp);
        }
        await this.pc.setLocalDescription(offer);
        return offer;
    }

    async createAnswer(): Promise<RTCSessionDescriptionInit> {
        const answer = await this.pc.createAnswer();
        if (answer.sdp) {
            answer.sdp = optimizeSDP(answer.sdp);
        }
        await this.pc.setLocalDescription(answer);
        return answer;
    }

    async setRemoteDescription(sdp: RTCSessionDescriptionInit): Promise<void> {
        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }

    async attemptIceRestart(): Promise<void> {
        try {
            console.log("[webrtc] Attempting ICE restart for:", this.id);
            const offer = await this.createOffer(true);
            this.onSignal(this.id, { type: "offer", sdp: offer });
        } catch (error) {
            console.error("[webrtc] ICE restart failed:", error);
        }
    }

    getSenders(): RTCRtpSender[] {
        return this.pc.getSenders();
    }

    close(): void {
        this.pc.close();
    }

    get connectionState(): RTCPeerConnectionState {
        return this.pc.connectionState;
    }
}
