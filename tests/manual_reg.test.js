const db = require('../database');

describe('Manual Sale Registration (!rv)', () => {
    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        await db.initDb();
    });

    beforeEach(async () => {
        await db.clearAllSales();
    });

    afterAll(async () => {
        await db.close();
    });

    test('getLastLocation should return the last address for a number', async () => {
        await db.registerSale('User A', '123', 1, 2000, 'Calle 1');
        await db.registerSale('User A', '123', 2, 4000, 'Calle 2');

        const loc = await db.getLastLocation('123');
        expect(loc).toBe('Calle 2');
    });

    test('getLastLocation should return empty string if no location found', async () => {
        const loc = await db.getLastLocation('999');
        expect(loc).toBe('');
    });

    test('registerSale should work with manual parameters', async () => {
        const id = await db.registerSale('Manual', '555', 3, 6000, 'Address Test');
        expect(id).toBeDefined();

        const summary = await db.getFinancialSummary();
        expect(summary.today.qty).toBe(3);
        expect(summary.today.total).toBe(6000);
    });
});
