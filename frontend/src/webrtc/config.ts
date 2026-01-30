function isValidIceServer(server: any): boolean {
    return server && typeof server === "object" && server.urls;
}

async function fetchWithTimeout(url: string, ms = 5000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);

    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

export async function getIceServers(): Promise<RTCIceServer[]> {
    const env = ((typeof import.meta !== "undefined" && import.meta.env)
        ? import.meta.env
        : {}) as any;

    const {
        VITE_METERED_API_KEY,
        VITE_ICE_SERVERS,
        VITE_TURN_URL,
        VITE_TURN_USERNAME,
        VITE_TURN_CREDENTIAL
    } = env;

    if (VITE_METERED_API_KEY) {
        try {
            const res = await fetchWithTimeout(
                `https://purestream.metered.live/api/v1/turn/credentials?apiKey=${VITE_METERED_API_KEY}`
            );

            if (res.ok) {
                const data = await res.json();
                const iceServers = Array.isArray(data)
                    ? data.filter(isValidIceServer)
                    : [];

                if (iceServers.length) {
                    console.log("[webrtc] Using Metered TURN servers:", iceServers.length);
                    return iceServers;
                }

                console.warn("[webrtc] Metered returned no valid ICE servers");
            } else {
                console.warn("[webrtc] Metered request failed:", res.status);
            }
        } catch (err) {
            console.warn("[webrtc] Metered TURN fetch failed:", err);
        }
    }

    if (VITE_ICE_SERVERS) {
        try {
            const parsed = JSON.parse(VITE_ICE_SERVERS as string);
            const iceServers = Array.isArray(parsed)
                ? parsed.filter(isValidIceServer)
                : [];

            if (iceServers.length) {
                console.log("[webrtc] Using ICE servers from VITE_ICE_SERVERS");
                return iceServers;
            }

            console.warn("[webrtc] VITE_ICE_SERVERS contained no valid servers");
        } catch (err) {
            console.warn("[webrtc] Invalid VITE_ICE_SERVERS JSON:", err);
        }
    }

    const servers: RTCIceServer[] = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ];

    if (VITE_TURN_URL) {
        servers.push({
            urls: VITE_TURN_URL as string,
            username: VITE_TURN_USERNAME as string,
            credential: VITE_TURN_CREDENTIAL as string
        });

        console.log("[webrtc] Added TURN server from env variables");
    }

    console.log("[webrtc] Using fallback STUN/TURN servers");
    return servers;
}
