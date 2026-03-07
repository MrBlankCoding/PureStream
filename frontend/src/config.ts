export const IS_PACKAGED = window.location.protocol === 'file:';
export const BACKEND_URL = IS_PACKAGED ? 'http://localhost:8000' : '';
export const WS_URL = IS_PACKAGED 
    ? 'ws://localhost:8000' 
    : (window.location.protocol === "https:" ? "wss:" : "ws:") + "//" + window.location.host;

export function getRelativePath(path: string): string {
    if (IS_PACKAGED) {
        return path.startsWith('/') ? path.substring(1) : path;
    }
    return path;
}
