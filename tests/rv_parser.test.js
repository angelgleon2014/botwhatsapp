const { parseRvCommand } = require('../utils');

describe('!rv Command Parser', () => {
    beforeAll(() => {
        process.env.NODE_ENV = 'test';
    });

    test('should parse simple format correctly', () => {
        const result = parseRvCommand('!rv 56912345678 2');
        expect(result).toEqual({ numero: '56912345678', cantidad: 2 });
    });

    test('should parse format with spaces correctly', () => {
        const result = parseRvCommand('!rv +56 9 2208 1983 2');
        expect(result).toEqual({ numero: '56922081983', cantidad: 2 });
    });

    test('should handle international format with parentheses and dashes', () => {
        const result = parseRvCommand('!rv +1 (809) 964-6299 1');
        expect(result).toEqual({ numero: '18099646299', cantidad: 1 });
    });

    test('should handle international format without quantity (default 1)', () => {
        const result = parseRvCommand('!rv +58 412-4756712');
        expect(result).toEqual({ numero: '584124756712', cantidad: 1 });
    });

    test('should handle formats with multiple symbols', () => {
        const result = parseRvCommand('!rv +57 314 7069097');
        expect(result).toEqual({ numero: '573147069097', cantidad: 1 });
    });

    test('should return null for invalid/short numbers', () => {
        const result = parseRvCommand('!rv 123 1');
        expect(result).toBeNull();
    });

    test('should return null for empty input', () => {
        const result = parseRvCommand('!rv');
        expect(result).toBeNull();
    });

    test('should handle quantity correctly even if it looks like part of the number', () => {
        // En este caso, el último '2' se toma como cantidad
        const result = parseRvCommand('!rv 56912345678 2');
        expect(result.cantidad).toBe(2);
        expect(result.numero).toBe('56912345678');
    });
});
