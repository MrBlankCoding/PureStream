import { DEFAULT_CONFIG } from "./constants.js";

export function optimizeSDP(sdp, maxBitrate = DEFAULT_CONFIG.maxBitrate) {
    let optimized = sdp;
    optimized = addBandwidthLimit(optimized, maxBitrate);
    optimized = preferCodec(optimized, 'video', 'VP8');

    return optimized;
}

function addBandwidthLimit(sdp, bitrateKbps) {
    const lines = sdp.split("\n");
    let videoLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("m=video")) {
            videoLineIdx = i;
            break;
        }
    }

    if (videoLineIdx === -1) return sdp;
    let nextSection = lines.length;
    for (let i = videoLineIdx + 1; i < lines.length; i++) {
        if (lines[i].startsWith("m=")) {
            nextSection = i;
            break;
        }
    }

    const bandwidthLine = `b=AS:${bitrateKbps}`;
    let inserted = false;
    for (let i = videoLineIdx; i < nextSection; i++) {
        if (lines[i].startsWith("b=AS:") || lines[i].startsWith("b=TIAS:")) {
            lines[i] = bandwidthLine;
            inserted = true;
            break;
        }
    }

    if (!inserted) {
        let insertAt = videoLineIdx + 1;
        for (let i = videoLineIdx + 1; i < nextSection; i++) {
            if (lines[i].startsWith("c=")) {
                insertAt = i + 1;
                break;
            }
        }

        lines.splice(insertAt, 0, bandwidthLine);
    }

    return lines.join("\n");
}

function preferCodec(sdp, mediaType, codecName) {
    const lines = sdp.split('\n');
    let mediaLineIndex = -1;
    let codecPayloadType = null;

    // Find media line
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(`m=${mediaType}`)) {
            mediaLineIndex = i;
            break;
        }
    }

    if (mediaLineIndex === -1) return sdp;
    for (let i = mediaLineIndex + 1; i < lines.length; i++) {
        if (lines[i].startsWith('m=')) break;

        const rtpmapMatch = lines[i].match(/^a=rtpmap:(\d+)\s+([^/]+)/);
        if (rtpmapMatch && rtpmapMatch[2].toLowerCase() === codecName.toLowerCase()) {
            codecPayloadType = rtpmapMatch[1];
            break;
        }
    }

    if (!codecPayloadType) return sdp;
    const mediaLine = lines[mediaLineIndex];
    const parts = mediaLine.split(' ');
    const payloadTypes = parts.slice(3);

    const reordered = [
        codecPayloadType,
        ...payloadTypes.filter(pt => pt !== codecPayloadType)
    ];

    lines[mediaLineIndex] = `${parts.slice(0, 3).join(' ')} ${reordered.join(' ')}`;

    return lines.join('\n');
}

export async function applyVideoEncoding(sender, maxBitrate) {
    const parameters = sender.getParameters();

    if (!parameters.encodings || parameters.encodings.length === 0) {
        parameters.encodings = [{}];
    }

    parameters.encodings[0].maxBitrate = maxBitrate * 1000; // Convert to bps
    parameters.encodings[0].priority = 'high';
    parameters.encodings[0].networkPriority = 'high';

    try {
        await sender.setParameters(parameters);
        console.log("[webrtc] Applied video encoding parameters");
    } catch (error) {
        console.warn("[webrtc] Failed to set encoding parameters:", error);
    }
}
