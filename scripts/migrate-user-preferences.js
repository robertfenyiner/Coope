const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'gastos_robert.db');
const db = new sqlite3.Database(dbPath);

function ensureColumn(table, column, definition) {
  db.all(`PRAGMA table_info(${table})`, (err, columns) => {
    if (err) {
      console.error('Error inspeccionando tabla', table, err);
      return;
    }
    if (!columns.some(col => col.name === column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (alterErr) => {
        if (alterErr) {
          console.error(`Error agregando columna ${column}:`, alterErr);
        } else {
          console.log(`Columna ${column} agregada a ${table}`);
        }
      });
    } else {
      console.log(`Columna ${column} ya existe en ${table}`);
    }
  });
}

db.serialize(() => {
  ensureColumn('users', 'payment_cycle', "VARCHAR(20) DEFAULT 'monthly'");
  ensureColumn('users', 'reminder_days_before', 'INTEGER DEFAULT 3');
});

db.close();
console.log('Migración completada');
