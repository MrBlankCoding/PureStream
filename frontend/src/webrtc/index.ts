import { ws } from "../websocket.js";
import { ConnectionState, DEFAULT_CONFIG } from "./constants.js";
import { getIceServers } from "./config.js";
import { applyVideoEncoding } from "./utils.js";

interface WebRTCConfig {
    maxBitrate: number;
    iceTransportPolicy: RTCIceTransportPolicy;
    iceCandidatePoolSize: number;
    connectionTimeout: number;
    reconnectAttempts: number;
    reconnectDelay: number;
}

type TrackCallback = (stream: MediaStream, id: string) => void;
type DisconnectCallback = (id: string) => void;

class WebRTCManager {
    private _config: WebRTCConfig;
    private _rtcConfig: RTCConfiguration | null;
    private _localStream: MediaStream | null;
    private _sfuConnection: RTCPeerConnection | null;
    private _onTrackCallback: TrackCallback | null;
    private _onDisconnectCallback: DisconnectCallback | null;
    private _connectionState: ConnectionState;

    constructor(config: Partial<WebRTCConfig> = {}) {
        this._config = { ...DEFAULT_CONFIG, ...config };
        this._rtcConfig = null;
        this._localStream = null;
        this._sfuConnection = null;
        this._onTrackCallback = null;
        this._onDisconnectCallback = null;
        this._connectionState = ConnectionState.NEW as ConnectionState;
    }

    async _ensureInitialized() {
        if (!this._rtcConfig) {
            const iceServers = await getIceServers();
            this._rtcConfig = {
                iceServers,
                iceTransportPolicy: this._config.iceTransportPolicy,
                iceCandidatePoolSize: this._config.iceCandidatePoolSize
            };
        }
    }

    setOnTrack(callback: TrackCallback) {
        this._onTrackCallback = callback;
    }

    setOnDisconnect(callback: DisconnectCallback) {
        this._onDisconnectCallback = callback;
    }

    async startSharing(_userList: any[], _myUserId: string): Promise<MediaStream> {
        await this._ensureInitialized();

        // Check if getDisplayMedia is supported (with type guard/check)
        if (!navigator.mediaDevices || !(navigator.mediaDevices as any).getDisplayMedia) {
            throw new Error("Screen sharing not supported in this browser");
        }

        this._localStream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: {
                cursor: "always",
                frameRate: { ideal: 30, max: 60 },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });

        if (!this._localStream) throw new Error("Failed to get stream");

        // Handle stream stop (user clicks "Stop sharing" in browser UI)
        this._localStream.getTracks().forEach(track => {
            track.onended = () => {
                this.stopSharing();
                if (this._onDisconnectCallback) this._onDisconnectCallback("local");
            };
        });

        // Connect to SFU as Publisher
        await this._connectToSFU(true);

        return this._localStream;
    }

    stopSharing() {
        if (this._localStream) {
            this._localStream.getTracks().forEach(track => track.stop());
            this._localStream = null;
        }
        if (this._sfuConnection) {
            this._sfuConnection.close();
            this._sfuConnection = null;
        }
    }

    // Connect to SFU (either as publisher or subscriber)
    private async _connectToSFU(isPublisher: boolean) {
        if (this._sfuConnection) {
            this._sfuConnection.close();
        }

        await this._ensureInitialized();
        const pc = new RTCPeerConnection(this._rtcConfig!);
        this._sfuConnection = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send({
                    type: "signal",
                    target: "sfu",
                    data: {
                        type: "candidate",
                        candidate: event.candidate.toJSON()
                    }
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log("[webrtc] SFU Connection State:", pc.connectionState);
            this._connectionState = pc.connectionState as ConnectionState;
            if (['failed', 'closed'].includes(pc.connectionState)) {
                // handle disconnect logic if needed
            }
        };

        if (isPublisher && this._localStream) {
            // Add tracks and apply encoder params for video senders
            for (const track of this._localStream.getTracks()) {
                const sender = pc.addTrack(track, this._localStream!);
                if (track.kind === 'video') {
                    // Apply bitrate and priority settings; don't block on it
                    applyVideoEncoding(sender, this._config.maxBitrate).catch(() => { /* noop */ });
                }
                // Keep local track end handling close to the sender as well
                track.onended = () => {
                    this.stopSharing();
                    if (this._onDisconnectCallback) this._onDisconnectCallback("local");
                };
            }
        } else {
            // Subscriber: Add transceiver to receive video/audio
            pc.addTransceiver("video", { direction: "recvonly" });
            pc.addTransceiver("audio", { direction: "recvonly" });
        }

        pc.ontrack = (event) => {
            console.log("[webrtc] Track received:", event.track.kind);
            if (this._onTrackCallback) {
                this._onTrackCallback(event.streams[0], "sfu");
            }

            try {
                event.track.onended = () => {
                    if (this._onDisconnectCallback) this._onDisconnectCallback("remote");
                };
            } catch (e) {
                // ignore
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        ws.send({
            type: "signal",
            target: "sfu",
            data: {
                type: "offer",
                sdp: offer.sdp,
                intent: isPublisher ? "publish" : "subscribe"
            }
        });
    }

    // Called by viewer when a new sharer is announced
    connectToSharer(_sharerId: string) {
        // In P2P we connected to sharerId. In SFU, we connect to SFU.
        this._connectToSFU(false);
    }

    async handleSignal(_senderId: string, data: any) {
        if (!this._sfuConnection) return;

        if (data.type === "answer") {
            const answer = new RTCSessionDescription(data);
            await this._sfuConnection.setRemoteDescription(answer);
        } else if (data.candidate) {
            const candidate = new RTCIceCandidate(data.candidate);
            await this._sfuConnection.addIceCandidate(candidate);
        }
    }

    getPeerState(_remoteId: string): ConnectionState {
        return this._connectionState;
    }
}

export const rtc = new WebRTCManager();
