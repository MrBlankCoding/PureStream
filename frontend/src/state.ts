interface User {
    id: string;
    username: string;
    inCall?: boolean;
    muted?: boolean;
    deafened?: boolean;
}

interface ChatMessage {
    userId: string;
    username: string;
    text: string;
    timestamp: number;
}

interface VoicePeerState {
    muted: boolean;
    deafened: boolean;
}

export interface ApplicationState {
    userId: string;
    username: string;
    roomId: string | null;
    users: User[];
    sharerId: string | null;
    sharerName: string | null;
    isSharing: boolean;
    voiceMuted: boolean;
    voiceDeafened: boolean;
    voicePeers: Map<string, VoicePeerState>;
    inCall: boolean;
    chat: ChatMessage[];
}

type StateListener = (state: ApplicationState) => void;

class AppState {
    private _state: ApplicationState;
    private _listeners: Set<StateListener>;

    constructor() {
        this._state = {
            userId: crypto.randomUUID(),
            username: "Guest",
            roomId: null,
            users: [],
            sharerId: null,
            sharerName: null,
            isSharing: false,
            voiceMuted: false,
            voiceDeafened: false,
            voicePeers: new Map(),
            inCall: false,
            chat: []
        };
        this._listeners = new Set();
    }

    get userId(): string { return this._state.userId; }
    get username(): string { return this._state.username; }
    get roomId(): string | null { return this._state.roomId; }
    get users(): User[] { return this._state.users; }
    get sharerId(): string | null { return this._state.sharerId; }
    get sharerName(): string | null { return this._state.sharerName; }
    get isSharing(): boolean { return this._state.isSharing; }
    get voiceMuted(): boolean { return this._state.voiceMuted; }
    get voiceDeafened(): boolean { return this._state.voiceDeafened; }
    get voicePeers(): Map<string, VoicePeerState> { return this._state.voicePeers; }
    get inCall(): boolean { return this._state.inCall; }
    get chat(): ChatMessage[] { return this._state.chat; }

    setUsername(name: string): void {
        this._state.username = name;
        this._notify();
    }

    setRoomId(id: string): void {
        this._state.roomId = id;
        this._notify();
    }

    setUsers(users: User[]): void {
        this._state.users = users;
        this._notify();
    }

    setSharer(id: string | null, name: string | null): void {
        this._state.sharerId = id;
        this._state.sharerName = name;
        this._notify();
    }

    setIsSharing(sharing: boolean): void {
        this._state.isSharing = sharing;
        this._notify();
    }

    setVoiceMuted(muted: boolean): void {
        this._state.voiceMuted = muted;
        this._notify();
    }

    setVoiceDeafened(deafened: boolean): void {
        this._state.voiceDeafened = deafened;
        this._notify();
    }

    setVoicePeerState(userId: string, muted: boolean, deafened: boolean): void {
        this._state.voicePeers.set(userId, { muted, deafened });
        this._notify();
    }

    setInCall(inCall: boolean): void {
        this._state.inCall = inCall;
        this._notify();
    }

    setChatHistory(messages: ChatMessage[]): void {
        this._state.chat = messages;
        this._notify();
    }

    appendChatMessage(message: ChatMessage): void {
        this._state.chat = [...this._state.chat, message].slice(-200);
        this._notify();
    }

    subscribe(callback: StateListener): () => boolean {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    private _notify(): void {
        this._listeners.forEach(cb => cb(this._state));
    }
}

export const state = new AppState();
