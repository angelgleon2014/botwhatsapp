const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data/database.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize database
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            number TEXT,
            date TEXT
        )
    `);
});

/**
 * Register a new sale
 */
function registerSale(name, number) {
    const today = new Date().toISOString().split('T')[0];
    return new Promise((resolve, reject) => {
        db.run('INSERT INTO sales (name, number, date) VALUES (?, ?, ?)', [name, number, today], function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
}

/**
 * Get customers who bought exactly N days ago
 */
function getSalesFromDaysAgo(days) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - days);
    const dateStr = targetDate.toISOString().split('T')[0];

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

    const minDateStr = minDate.toISOString().split('T')[0];
    const maxDateStr = maxDate.toISOString().split('T')[0];

    return new Promise((resolve, reject) => {
        db.all('SELECT DISTINCT name, number FROM sales WHERE date BETWEEN ? AND ?', [minDateStr, maxDateStr], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

module.exports = {
    registerSale,
    getSalesFromDaysAgo,
    getSalesInRange
};
