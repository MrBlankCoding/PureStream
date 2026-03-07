export const IS_PACKAGED = window.location.protocol === 'file:';

export function getBackendMode(): 'local' | 'hosted' {
    const stored = localStorage.getItem('purestream_backend_mode');
    return (stored as 'local' | 'hosted') || 'local';
}

export function setBackendMode(mode: 'local' | 'hosted') {
    localStorage.setItem('purestream_backend_mode', mode);
}

export const FRONTEND_URL = IS_PACKAGED ? 'https://purestream.onrender.com' : window.location.origin;

export const BACKEND_URL = IS_PACKAGED 
    ? (getBackendMode() === 'hosted' ? 'https://purestream.onrender.com' : 'http://localhost:8000') 
    : '';

export const WS_URL = IS_PACKAGED 
    ? (getBackendMode() === 'hosted' ? 'wss://purestream.onrender.com' : 'ws://localhost:8000')
    : (window.location.protocol === "https:" ? "wss:" : "ws:") + "//" + window.location.host;

export function getRelativePath(path: string): string {
    if (IS_PACKAGED) {
        if (path === '/') return './index.html';
        const cleaned = path.startsWith('/') ? path.substring(1) : path;
        return './' + cleaned;
    }
    return path;
}

export function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for non-secure contexts (e.g., file://)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
