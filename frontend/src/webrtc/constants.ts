export const ConnectionState = {
    NEW: 'new',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    FAILED: 'failed',
    CLOSED: 'closed'
} as const;

export type ConnectionState = typeof ConnectionState[keyof typeof ConnectionState];

export const DEFAULT_CONFIG = {
    maxBitrate: 8000, // kbps
    iceTransportPolicy: 'all' as RTCIceTransportPolicy, // 'all' or 'relay'
    iceCandidatePoolSize: 10,
    connectionTimeout: 15000, // 15 seconds
    reconnectAttempts: 3,
    reconnectDelay: 2000 // 2 seconds
};
