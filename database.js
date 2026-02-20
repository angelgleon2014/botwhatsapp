const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Si estamos en entorno de pruebas, usamos base de datos en memoria
const isTest = process.env.NODE_ENV === 'test';
const dbPath = isTest ? ':memory:' : path.resolve(__dirname, 'data/database.sqlite');
const db = new sqlite3.Database(dbPath);

/**
 * Helper: obtener fecha YYYY-MM-DD en zona horaria de Chile
 * @param {Date} date - Objeto Date (opcional, usa Date.now() si no se pasa)
 */
function getChileDate(date = new Date()) {
    return date.toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
}

// Initialize database
function initDb() {
    return new Promise((resolve) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS sales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    number TEXT,
                    date TEXT,
                    address TEXT,
                    quantity INTEGER DEFAULT 1,
                    total_clp INTEGER DEFAULT 0
                )
            `);

            // Migración simple para bases de datos existentes
            db.all("PRAGMA table_info(sales);", (err, rows) => {
                if (err || !rows) return resolve();
                const columns = rows.map(r => r.name);
                if (!columns.includes('quantity')) {
                    db.run("ALTER TABLE sales ADD COLUMN quantity INTEGER DEFAULT 1;");
                    db.run("ALTER TABLE sales ADD COLUMN total_clp INTEGER DEFAULT 0;");
                }
                if (!columns.includes('address')) {
                    db.run("ALTER TABLE sales ADD COLUMN address TEXT;");
                }
                resolve();
            });
        });
    });
}

// Ejecutar inicialización inmediatamente (excepto si queremos manejarla manual en tests)
if (!isTest) {
    initDb();
}

/**
 * Register a new sale
 * @param {string} customDate - Optional date in YYYY-MM-DD format (defaults to today)
 */
function registerSale(name, number, quantity = 1, totalClp = 0, address = '', customDate = null) {
    const date = customDate || getChileDate();
    return new Promise((resolve, reject) => {
        db.run('INSERT INTO sales (name, number, date, address, quantity, total_clp) VALUES (?, ?, ?, ?, ?, ?)',
            [name, number, date, address, quantity, totalClp],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

/**
 * Get customers who bought exactly N days ago
 */
function getSalesFromDaysAgo(days) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - days);
    const dateStr = getChileDate(targetDate);

    return new Promise((resolve, reject) => {
        db.all('SELECT DISTINCT name, number FROM sales WHERE date = ?', [dateStr], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

/**
 * Get customers who bought between minDays and maxDays ago
 */
function getSalesInRange(minDays, maxDays) {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - maxDays);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() - minDays);

    const minDateStr = getChileDate(minDate);
    const maxDateStr = getChileDate(maxDate);

    return new Promise((resolve, reject) => {
        db.all('SELECT DISTINCT name, number FROM sales WHERE date BETWEEN ? AND ?', [minDateStr, maxDateStr], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

/**
 * Financial Summary (Today, Yesterday, Week, Month)
 */
async function getFinancialSummary() {
    const today = getChileDate();

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = getChileDate(yesterdayDate);

    const weekDate = new Date();
    weekDate.setDate(weekDate.getDate() - 7);
    const lastWeek = getChileDate(weekDate);

    const monthDate = new Date();
    const monthStart = getChileDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));

    const query = (dateRange) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT COUNT(*) as count, SUM(total_clp) as total, SUM(quantity) as qty FROM sales WHERE ${dateRange}`, (err, row) => {
                if (err) reject(err);
                else resolve(row || { count: 0, total: 0, qty: 0 });
            });
        });
    };

    return {
        today: await query(`date = '${today}'`),
        yesterday: await query(`date = '${yesterday}'`),
        week: await query(`date >= '${lastWeek}'`),
        month: await query(`date >= '${monthStart}'`)
    };
}

/**
 * Detailed sales for Excel
 */
function getMonthlySalesData() {
    const monthDate = new Date();
    const monthStart = getChileDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));

    return new Promise((resolve, reject) => {
        db.all('SELECT date, name, number, address, quantity, total_clp FROM sales WHERE date >= ? ORDER BY date DESC', [monthStart], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

/**
 * Get top N clients of the current month
 */
function getTopClients(limit = 3) {
    const monthDate = new Date();
    const monthStart = getChileDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));

    return new Promise((resolve, reject) => {
        db.all(`
            SELECT name, number, SUM(quantity) as total_qty 
            FROM sales 
            WHERE date >= ? 
            GROUP BY name, number 
            ORDER BY total_qty DESC 
            LIMIT ?
        `, [monthStart, limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

/**
 * Check if a sale already exists for a number and date
 */
function saleExists(number, date) {
    return new Promise((resolve, reject) => {
        db.get('SELECT id FROM sales WHERE number = ? AND date = ?', [number, date], (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
        });
    });
}

/**
 * Clear all sales from database (Useful for testing)
 */
function clearAllSales() {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM sales', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

/**
 * Delete the last sale recorded in the database
 */
function deleteLastSale() {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM sales WHERE id = (SELECT MAX(id) FROM sales)', function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

/**
 * Delete the last sale for a specific phone number
 */
function deleteLastSaleByNumber(number) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM sales WHERE id = (SELECT MAX(id) FROM sales WHERE number = ?)', [number], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

/**
 * Close database connection
 */
function close() {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = {
    registerSale,
    getSalesFromDaysAgo,
    getSalesInRange,
    getFinancialSummary,
    getMonthlySalesData,
    getTopClients,
    getChileDate,
    saleExists,
    deleteLastSale,
    deleteLastSaleByNumber,
    initDb,
    clearAllSales,
    close
};
