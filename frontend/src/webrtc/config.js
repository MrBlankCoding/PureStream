export async function getIceServers() {
    const env = (import.meta && import.meta.env) ? import.meta.env : {};
    const apiKey = env.VITE_METERED_API_KEY;
    if (apiKey) {
        try {
            const response = await fetch(
                `https://purestream.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
                { timeout: 5000 } // Add timeout
            );
            if (response.ok) {
                const iceServers = await response.json();
                console.log("[webrtc] Using Metered TURN servers:", iceServers.length);
                return iceServers;
            }
        } catch (error) {
            console.warn("[webrtc] Failed to fetch Metered TURN servers:", error);
        }
    }

    const json = env.VITE_ICE_SERVERS;
    if (json) {
        try {
            const parsed = JSON.parse(json);
            if (Array.isArray(parsed) && parsed.length > 0) {
                console.log("[webrtc] Using ICE servers from VITE_ICE_SERVERS");
                return parsed;
            }
        } catch (e) {
            console.warn("[webrtc] Invalid VITE_ICE_SERVERS JSON:", e.message);
        }
    }

    const servers = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun1.l.google.com:19302" }
    ];

    const turnUrl = env.VITE_TURN_URL;
    const turnUsername = env.VITE_TURN_USERNAME;
    const turnCredential = env.VITE_TURN_CREDENTIAL;

    if (turnUrl) {
        servers.push({
            urls: turnUrl,
            username: turnUsername,
            credential: turnCredential
        });
        console.log("[webrtc] Added TURN server from env variables");
    }

    console.log("[webrtc] Using fallback STUN servers");
    return servers;
}
