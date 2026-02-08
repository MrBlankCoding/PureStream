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

type SignalMessage =
    | { type: "answer"; sdp: string }
    | { type: "candidate"; candidate: RTCIceCandidateInit };

class WebRTCManager {
    private config: WebRTCConfig;
    private rtcConfig?: RTCConfiguration;
    private localStream?: MediaStream;
    private pc?: RTCPeerConnection;
    private onTrack?: TrackCallback;
    private onDisconnect?: DisconnectCallback;
    private connectionState: ConnectionState = ConnectionState.NEW;

    constructor(config: Partial<WebRTCConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    private async ensureInitialized() {
        if (!this.rtcConfig) {
            const iceServers = await getIceServers();
            this.rtcConfig = {
                iceServers,
                iceTransportPolicy: this.config.iceTransportPolicy,
                iceCandidatePoolSize: this.config.iceCandidatePoolSize
            };
        }
    }

    setOnTrack(callback: TrackCallback) {
        this.onTrack = callback;
    }

    setOnDisconnect(callback: DisconnectCallback) {
        this.onDisconnect = callback;
    }

    async startSharing(): Promise<MediaStream> {
        await this.ensureInitialized();

        if (!navigator.mediaDevices?.getDisplayMedia) {
            throw new Error("Screen sharing not supported");
        }

        this.localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always",
                frameRate: { ideal: 30, max: 60 },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            } as any,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });

        this.localStream.getTracks().forEach(track => {
            track.onended = () => this.cleanup("local");
        });

        await this.connectToSFU(true);
        return this.localStream;
    }

    stopSharing() {
        this.cleanup("local");
    }

    private cleanup(source: "local" | "remote") {
        this.localStream?.getTracks().forEach(t => t.stop());
        this.localStream = undefined;

        this.pc?.close();
        this.pc = undefined;

        this.onDisconnect?.(source);
    }

    private async connectToSFU(publish: boolean) {
        await this.ensureInitialized();

        this.pc?.close();
        this.pc = new RTCPeerConnection(this.rtcConfig);

        this.pc.onicecandidate = e => {
            if (!e.candidate) return;
            ws.send({
                type: "signal",
                target: "sfu",
                data: { type: "candidate", candidate: e.candidate.toJSON() }
            });
        };

        this.pc.onconnectionstatechange = () => {
            this.connectionState = this.pc!.connectionState as ConnectionState;
            if (["failed", "closed"].includes(this.pc!.connectionState)) {
                this.cleanup("remote");
            }
        };

        this.pc.ontrack = e => {
            this.onTrack?.(e.streams[0], "sfu");
            e.track.onended = () => this.cleanup("remote");
        };

        if (publish && this.localStream) {
            for (const track of this.localStream.getTracks()) {
                const sender = this.pc.addTrack(track, this.localStream);
                if (track.kind === "video") {
                    applyVideoEncoding(sender, this.config.maxBitrate).catch(() => { });
                }
            }
        } else {
            this.pc.addTransceiver("video", { direction: "recvonly" });
            this.pc.addTransceiver("audio", { direction: "recvonly" });
        }

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        ws.send({
            type: "signal",
            target: "sfu",
            data: {
                type: "offer",
                sdp: offer.sdp,
                intent: publish ? "publish" : "subscribe"
            }
        });
    }

    connectToSharer() {
        this.connectToSFU(false);
    }

    async handleSignal(_: string, data: SignalMessage) {
        if (!this.pc) return;

        if (data.type === "answer") {
            await this.pc.setRemoteDescription({
                type: "answer",
                sdp: data.sdp
            });
        } else if ("candidate" in data) {
            await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }

    getPeerState(): ConnectionState {
        return this.connectionState;
    }
}

export const rtc = new WebRTCManager();
