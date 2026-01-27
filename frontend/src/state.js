class AppState {
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

    get userId() { return this._state.userId; }
    get username() { return this._state.username; }
    get roomId() { return this._state.roomId; }
    get users() { return this._state.users; }
    get sharerId() { return this._state.sharerId; }
    get sharerName() { return this._state.sharerName; }
    get isSharing() { return this._state.isSharing; }
    get voiceMuted() { return this._state.voiceMuted; }
    get voiceDeafened() { return this._state.voiceDeafened; }
    get voicePeers() { return this._state.voicePeers; }
    get inCall() { return this._state.inCall; }
    get chat() { return this._state.chat; }

    setUsername(name) {
        this._state.username = name;
        this._notify();
    }

    setRoomId(id) {
        this._state.roomId = id;
        this._notify();
    }

    setUsers(users) {
        this._state.users = users;
        this._notify();
    }

    setSharer(id, name) {
        this._state.sharerId = id;
        this._state.sharerName = name;
        this._notify();
    }

    setIsSharing(sharing) {
        this._state.isSharing = sharing;
        this._notify();
    }

    setVoiceMuted(muted) {
        this._state.voiceMuted = muted;
        this._notify();
    }

    setVoiceDeafened(deafened) {
        this._state.voiceDeafened = deafened;
        this._notify();
    }

    setVoicePeerState(userId, muted, deafened) {
        this._state.voicePeers.set(userId, { muted, deafened });
        this._notify();
    }

    setInCall(inCall) {
        this._state.inCall = inCall;
        this._notify();
    }

    setChatHistory(messages) {
        this._state.chat = messages;
        this._notify();
    }

    appendChatMessage(message) {
        this._state.chat = [...this._state.chat, message].slice(-200);
        this._notify();
    }

    subscribe(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    _notify() {
        this._listeners.forEach(cb => cb(this._state));
    }
}

export const state = new AppState();
