import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocketServer from 'vitest-websocket-mock';
import { WebSocketManager } from '../websocket';
import { WS_URL } from '../config';

describe('WebSocketManager', () => {
    let server: WebSocketServer;
    let wsManager: WebSocketManager;
    const testUrl = `${WS_URL}/ws/room1/user1`;

    beforeEach(async () => {
        server = new WebSocketServer(testUrl);
        wsManager = new WebSocketManager();
    });

    afterEach(() => {
        wsManager.disconnect();
        server.close();
    });

    it('should connect and emit open event', async () => {
        const onOpen = vi.fn();
        wsManager.on('open', onOpen);
        
        wsManager.connect('room1', 'user1');
        await server.connected;
        
        expect(wsManager.isConnected).toBe(true);
        expect(onOpen).toHaveBeenCalled();
    });

    it('should send messages when connected', async () => {
        wsManager.connect('room1', 'user1');
        await server.connected;
        
        const data = { type: 'test', content: 'hello' };
        wsManager.send(data);
        
        await expect(server).toReceiveMessage(JSON.stringify(data));
    });

    it('should emit events when messages are received', async () => {
        const onTest = vi.fn();
        wsManager.on('test-event', onTest);
        
        wsManager.connect('room1', 'user1');
        await server.connected;
        
        const msg = { type: 'test-event', data: 'some-data' };
        server.send(JSON.stringify(msg));
        
        expect(onTest).toHaveBeenCalledWith(msg);
    });

    it('should handle disconnection', async () => {
        const onClose = vi.fn();
        wsManager.on('close', onClose);
        
        wsManager.connect('room1', 'user1');
        await server.connected;
        
        wsManager.disconnect();
        expect(wsManager.isConnected).toBe(false);
        expect(onClose).toHaveBeenCalled();
    });
});
