const db = require('../database');

describe('Database Module', () => {
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

    test('getChileDate returns a valid YYYY-MM-DD string', () => {
        const date = db.getChileDate(new Date('2024-12-25T10:00:00Z'));
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('registerSale should insert a sale and return an ID', async () => {
        const id = await db.registerSale('Test User', '56912345678', 2, 4000, 'Depto 101');
        expect(id).toBeDefined();
        expect(typeof id).toBe('number');
    });

    test('saleExists should detect a duplicate sale', async () => {
        const num = '56988887777';
        const date = '2024-01-01';
        await db.registerSale('Check Dupe', num, 1, 2000, '', date);

        const exists = await db.saleExists(num, date);
        expect(exists).toBe(true);

        const notExists = await db.saleExists(num, '2024-01-02');
        expect(notExists).toBe(false);
    });

    test('getFinancialSummary should calculate totals correctly', async () => {
        const today = db.getChileDate();
        // Insert some sales for today
        await db.registerSale('User 1', '1', 2, 4000, '', today);
        await db.registerSale('User 2', '2', 3, 6000, '', today);

        const summary = await db.getFinancialSummary();
        expect(summary.today.qty).toBe(5);
        expect(summary.today.total).toBe(10000);
    });

    test('getTopClients should return ranked clients', async () => {
        // Clear or just add more
        await db.registerSale('Top A', 'A', 10, 20000);
        await db.registerSale('Top B', 'B', 5, 10000);
        await db.registerSale('Top C', 'C', 1, 2000);

        const top = await db.getTopClients(2);
        expect(top.length).toBe(2);
        expect(top[0].name).toBe('Top A');
        expect(top[1].name).toBe('Top B');
    });
});
