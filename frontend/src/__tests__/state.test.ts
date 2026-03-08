import { describe, it, expect, vi, beforeEach } from 'vitest';
import { state } from '../state';

describe('AppState', () => {
    beforeEach(() => {
        // Reset state or create a new instance if needed,
        // but for now let's just test the singleton behavior.
        state.setUsername('Guest');
    });

    it('should update username and notify listeners', () => {
        const listener = vi.fn();
        state.subscribe(listener);

        state.setUsername('Alice');

        expect(state.username).toBe('Alice');
        expect(listener).toHaveBeenCalled();
        const calledState = listener.mock.calls[0][0];
        expect(calledState.username).toBe('Alice');
    });

    it('should update room ID', () => {
        state.setRoomId('room-123');
        expect(state.roomId).toBe('room-123');
    });

    it('should manage users list', () => {
        const users = [{ id: '1', username: 'Alice' }];
        state.setUsers(users);
        expect(state.users).toEqual(users);
    });

    it('should update voice state', () => {
        state.setVoiceMuted(true);
        expect(state.voiceMuted).toBe(true);
        state.setVoiceDeafened(true);
        expect(state.voiceDeafened).toBe(true);
    });

    it('should update voice peer state', () => {
        state.setVoicePeerState('user2', true, false);
        const peer = state.voicePeers.get('user2');
        expect(peer?.muted).toBe(true);
        expect(peer?.deafened).toBe(false);
    });

    it('should update call state', () => {
        state.setInCall(true);
        expect(state.inCall).toBe(true);
    });

    it('should update whiteboard data', () => {
        const data = [{ type: 'rect' }];
        state.setWhiteboardData(data);
        expect(state.whiteboardData).toBe(data);
    });

    it('should set sharer', () => {
        state.setSharer('user1', 'Alice');
        expect(state.sharerId).toBe('user1');
        expect(state.sharerName).toBe('Alice');
    });

    it('should set whiteboarding and sharing status', () => {
        state.setIsSharing(true);
        expect(state.isSharing).toBe(true);
        state.setIsWhiteboarding(true);
        expect(state.isWhiteboarding).toBe(true);
    });
});
