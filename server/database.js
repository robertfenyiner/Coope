const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Usar variable de entorno para el path de la base de datos si existe
const dbPath = process.env.DB_PATH || path.join(__dirname, 'gastos_robert.db');

// Crear archivo de base de datos si no existe
if (!fs.existsSync(dbPath)) {
  try {
    fs.writeFileSync(dbPath, '');
    console.log(`[${new Date().toISOString()}] Archivo de base de datos creado en: ${dbPath}`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error creando archivo de base de datos:`, err.message);
    process.exit(1);
  }
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(`[${new Date().toISOString()}] Error al abrir la base de datos:`, err.message);
    process.exit(1);
  } else {
    console.log(`[${new Date().toISOString()}] Base de datos abierta en: ${dbPath}`);
  }
});

// Inicializar base de datos con tablas
db.serialize(() => {
  // Tabla de usuarios
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de categorías
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      color VARCHAR(7) DEFAULT '#3B82F6',
      icon VARCHAR(50) DEFAULT 'shopping-cart',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Tabla de monedas
  db.run(`
    CREATE TABLE IF NOT EXISTS currencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code VARCHAR(3) UNIQUE NOT NULL,
      name VARCHAR(50) NOT NULL,
      symbol VARCHAR(5) NOT NULL,
      exchange_rate DECIMAL(10,6) DEFAULT 1.0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de gastos
  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      currency_id INTEGER NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      amount_cop DECIMAL(10,2),
      exchange_rate_cop DECIMAL(10,6),
      description TEXT,
      date DATE NOT NULL,
      is_recurring BOOLEAN DEFAULT FALSE,
      recurring_frequency VARCHAR(20),
      next_due_date DATE,
      attachment_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE,
      FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE CASCADE
    )
  `);

  // Ensure attachment_path column exists for older databases
  db.all("PRAGMA table_info(expenses)", (err, columns) => {
    if (err) {
      console.error('Error inspeccionando tabla expenses:', err);
    } else if (!columns.some(col => col.name === 'attachment_path')) {
      db.run('ALTER TABLE expenses ADD COLUMN attachment_path TEXT', alterErr => {
        if (alterErr) {
          console.error('Error agregando attachment_path:', alterErr);
        }
      });
    }
  });

  // Tabla de recordatorios de email
  db.run(`
    CREATE TABLE IF NOT EXISTS email_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      expense_id INTEGER NOT NULL,
      reminder_date DATE NOT NULL,
      is_sent BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (expense_id) REFERENCES expenses (id) ON DELETE CASCADE
    )
  `);

  // Insertar monedas por defecto
  const currencies = [
    ['USD', 'Dólar Americano', '$'],
    ['EUR', 'Euro', '€'],
    ['COP', 'Peso Colombiano', '$'],
    ['CAD', 'Dólar Canadiense', 'C$'],
    ['GBP', 'Libra Esterlina', '£'],
    ['JPY', 'Yen Japonés', '¥'],
    ['MXN', 'Peso Mexicano', '$'],
    ['TRY', 'Lira Turca', '₺'],
    ['NGN', 'Naira Nigeriana', '₦']
  ];

  const insertCurrency = db.prepare(`
    INSERT OR IGNORE INTO currencies (code, name, symbol) VALUES (?, ?, ?)
  `);

  currencies.forEach(currency => {
    insertCurrency.run(currency);
  });

  insertCurrency.finalize();
});

module.exports = db;