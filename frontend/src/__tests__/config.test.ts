import { describe, it, expect } from 'vitest';
import { getBackendMode, generateUUID } from '../config';

describe('config', () => {
    it('should return backend mode', () => {
        const mode = getBackendMode();
        expect(['local', 'hosted']).toContain(mode);
    });

    it('should generate valid UUIDs', () => {
        const uuid1 = generateUUID();
        const uuid2 = generateUUID();
        expect(uuid1).not.toBe(uuid2);
        expect(uuid1.length).toBeGreaterThan(0);
    });
});
