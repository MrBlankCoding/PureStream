class AppState {
    constructor() {
        this._state = {
            userId: crypto.randomUUID(),
            username: "Guest",
            roomId: null,
            users: [],
            sharerId: null,
            sharerName: null,
            isSharing: false
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

    subscribe(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    _notify() {
        this._listeners.forEach(cb => cb(this._state));
    }
}

export const state = new AppState();
