const express = require('express');
const db = require('../database');
const authMiddleware = require('../middleware/auth');
const currencyService = require('../services/currencyService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Get all expenses for user
router.get('/', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 50, category, startDate, endDate, search } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
           cur.code as currency_code, cur.symbol as currency_symbol
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    JOIN currencies cur ON e.currency_id = cur.id
    WHERE e.user_id = ?
  `;
  
  const params = [userId];

  if (category) {
    query += ' AND e.category_id = ?';
    params.push(category);
  }

  if (startDate) {
    query += ' AND e.date >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND e.date <= ?';
    params.push(endDate);
  }

  if (search) {
    query += ' AND e.description LIKE ?';
    params.push(`%${search}%`);
  }

  query += ' ORDER BY e.date DESC, e.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, expenses) => {
    if (err) {
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM expenses e WHERE e.user_id = ?';
    const countParams = [userId];

    if (category) {
      countQuery += ' AND e.category_id = ?';
      countParams.push(category);
    }

    if (startDate) {
      countQuery += ' AND e.date >= ?';
      countParams.push(startDate);
    }

    if (endDate) {
      countQuery += ' AND e.date <= ?';
      countParams.push(endDate);
    }

    if (search) {
      countQuery += ' AND e.description LIKE ?';
      countParams.push(`%${search}%`);
    }

    db.get(countQuery, countParams, (err, countResult) => {
      if (err) {
        return res.status(500).json({ message: 'Error de base de datos' });
      }

      res.json({
        expenses,
        total: countResult.total,
        page: parseInt(page),
        totalPages: Math.ceil(countResult.total / limit)
      });
    });
  });
});

// Get expense by ID
router.get('/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const expenseId = req.params.id;

  const query = `
    SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
           cur.code as currency_code, cur.symbol as currency_symbol
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    JOIN currencies cur ON e.currency_id = cur.id
    WHERE e.id = ? AND e.user_id = ?
  `;

  db.get(query, [expenseId, userId], (err, expense) => {
    if (err) {
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    if (!expense) {
      return res.status(404).json({ message: 'Gasto no encontrado' });
    }

    res.json(expense);
  });
});

// Create new expense
router.post('/', authMiddleware, upload.single('attachment'), async (req, res) => {
  const userId = req.user.id;
  const {
    categoryId,
    currencyId,
    category_id,
    currency_id,
    amount,
    description,
    date,
    isRecurring = false,
    recurringFrequency = null,
    reminderDaysBefore = 1
  } = req.body;

  const resolvedCategoryId = categoryId || category_id;
  const resolvedCurrencyId = currencyId || currency_id;

  const reminderDays = parseInt(reminderDaysBefore);

  if (!resolvedCategoryId || !resolvedCurrencyId || !amount || !description || !date) {
    return res.status(400).json({ message: 'Todos los campos obligatorios deben proporcionarse' });
  }

  if (amount <= 0) {
    return res.status(400).json({ message: 'El monto debe ser mayor a 0' });
  }

  if (reminderDays < 1 || reminderDays > 3) {
    return res.status(400).json({ message: 'reminderDaysBefore debe estar entre 1 y 3' });
  }

  // Calculate next due date for recurring expenses
  let nextDueDate = null;
  if (isRecurring && recurringFrequency) {
    const currentDate = new Date(date);
    switch (recurringFrequency) {
      case 'daily':
        nextDueDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
        break;
      case 'weekly':
        nextDueDate = new Date(currentDate.setDate(currentDate.getDate() + 7));
        break;
      case 'monthly':
        nextDueDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
        break;
      case 'yearly':
        nextDueDate = new Date(currentDate.setFullYear(currentDate.getFullYear() + 1));
        break;
    }
  }

  let amountCop, exchangeRateCop;
  try {
    const currency = await new Promise((resolve, reject) => {
      db.get('SELECT code FROM currencies WHERE id = ?', [resolvedCurrencyId], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          reject(new Error('Moneda no encontrada'));
        } else {
          resolve(row);
        }
      });
    });

    const conversion = await currencyService.convertCurrency(amount, currency.code, 'COP');
    amountCop = conversion.convertedAmount;
    exchangeRateCop = conversion.exchangeRate;
  } catch (error) {
    console.error('Error converting currency to COP:', error);
    return res.status(500).json({ message: 'Error al convertir la moneda' });
  }

  const attachmentPath = req.file ? req.file.filename : null;
  const query = `
    INSERT INTO expenses
    (user_id, category_id, currency_id, amount, amount_cop, exchange_rate_cop, description, date, is_recurring, recurring_frequency, next_due_date, reminder_days_before, attachment_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [
    userId, resolvedCategoryId, resolvedCurrencyId, amount, amountCop, exchangeRateCop, description, date,
    isRecurring, recurringFrequency, nextDueDate?.toISOString().split('T')[0], reminderDays, attachmentPath
  ], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Error al crear el gasto' });
    }

    // Get the created expense with joined data
    const selectQuery = `
      SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
             cur.code as currency_code, cur.symbol as currency_symbol
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      JOIN currencies cur ON e.currency_id = cur.id
      WHERE e.id = ?
    `;

      db.get(selectQuery, [this.lastID], (err, expense) => {
        if (err) {
          return res.status(500).json({ message: 'Error al obtener el gasto creado' });
        }

        res.status(201).json({
          message: 'Gasto creado correctamente',
          expense
        });
      });
  });
});

// Update expense
router.put('/:id', authMiddleware, upload.single('attachment'), async (req, res) => {
  const userId = req.user.id;
  const expenseId = req.params.id;
  const {
    categoryId,
    currencyId,
    category_id,
    currency_id,
    amount,
    description,
    date,
    isRecurring,
    recurringFrequency,
    reminderDaysBefore = 1
  } = req.body;

  const resolvedCategoryId = categoryId || category_id;
  const resolvedCurrencyId = currencyId || currency_id;
  const reminderDays = parseInt(reminderDaysBefore);

  if (!resolvedCategoryId || !resolvedCurrencyId || !amount || !description || !date) {
    return res.status(400).json({ message: 'Todos los campos obligatorios deben proporcionarse' });
  }

  if (amount <= 0) {
    return res.status(400).json({ message: 'El monto debe ser mayor a 0' });
  }

  if (reminderDays < 1 || reminderDays > 3) {
    return res.status(400).json({ message: 'reminderDaysBefore debe estar entre 1 y 3' });
  }

  // Calculate next due date for recurring expenses
  let nextDueDate = null;
  if (isRecurring && recurringFrequency) {
    const currentDate = new Date(date);
    switch (recurringFrequency) {
      case 'daily':
        nextDueDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
        break;
      case 'weekly':
        nextDueDate = new Date(currentDate.setDate(currentDate.getDate() + 7));
        break;
      case 'monthly':
        nextDueDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
        break;
      case 'yearly':
        nextDueDate = new Date(currentDate.setFullYear(currentDate.getFullYear() + 1));
        break;
    }
  }

  let amountCop, exchangeRateCop;
  try {
    const currency = await new Promise((resolve, reject) => {
      db.get('SELECT code FROM currencies WHERE id = ?', [resolvedCurrencyId], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          reject(new Error('Moneda no encontrada'));
        } else {
          resolve(row);
        }
      });
    });

    const conversion = await currencyService.convertCurrency(amount, currency.code, 'COP');
    amountCop = conversion.convertedAmount;
    exchangeRateCop = conversion.exchangeRate;
  } catch (error) {
    console.error('Error converting currency to COP:', error);
    return res.status(500).json({ message: 'Error al convertir la moneda' });
  }

  const attachmentPath = req.file ? req.file.filename : null;
  const query = `
    UPDATE expenses
    SET category_id = ?, currency_id = ?, amount = ?, amount_cop = ?, exchange_rate_cop = ?, description = ?, date = ?,
        is_recurring = ?, recurring_frequency = ?, next_due_date = ?, reminder_days_before = ?, attachment_path = COALESCE(?, attachment_path), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `;

  db.run(query, [
    resolvedCategoryId, resolvedCurrencyId, amount, amountCop, exchangeRateCop, description, date,
    isRecurring, recurringFrequency, nextDueDate?.toISOString().split('T')[0], reminderDays, attachmentPath,
    expenseId, userId
  ], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Error al actualizar el gasto' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: 'Gasto no encontrado' });
    }

    // Get the updated expense with joined data
    const selectQuery = `
      SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
             cur.code as currency_code, cur.symbol as currency_symbol
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      JOIN currencies cur ON e.currency_id = cur.id
      WHERE e.id = ?
    `;

      db.get(selectQuery, [expenseId], (err, expense) => {
        if (err) {
          return res.status(500).json({ message: 'Error al obtener el gasto actualizado' });
        }

        res.json({
          message: 'Gasto actualizado correctamente',
          expense
        });
      });
  });
});

// Delete expense
router.delete('/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const expenseId = req.params.id;

  db.run('DELETE FROM expenses WHERE id = ? AND user_id = ?', [expenseId, userId], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Error al eliminar el gasto' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: 'Gasto no encontrado' });
    }

    res.json({ message: 'Gasto eliminado correctamente' });
  });
});

// Get expense statistics
router.get('/stats/summary', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { startDate, endDate, currency = 'USD' } = req.query;

  let query = `
    SELECT 
      c.name as category_name,
      c.color as category_color,
      COUNT(e.id) as expense_count,
      SUM(e.amount) as total_amount,
      AVG(e.amount) as avg_amount
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    JOIN currencies cur ON e.currency_id = cur.id
    WHERE e.user_id = ?
  `;

  const params = [userId];

  if (startDate) {
    query += ' AND e.date >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND e.date <= ?';
    params.push(endDate);
  }

  query += ' GROUP BY c.id, c.name, c.color ORDER BY total_amount DESC';

  db.all(query, params, (err, categoryStats) => {
    if (err) {
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    // Get total summary
    let totalQuery = `
      SELECT 
        COUNT(e.id) as total_expenses,
        SUM(e.amount) as total_amount,
        AVG(e.amount) as avg_amount
      FROM expenses e
      WHERE e.user_id = ?
    `;

    const totalParams = [userId];

    if (startDate) {
      totalQuery += ' AND e.date >= ?';
      totalParams.push(startDate);
    }

    if (endDate) {
      totalQuery += ' AND e.date <= ?';
      totalParams.push(endDate);
    }

    db.get(totalQuery, totalParams, (err, totalStats) => {
      if (err) {
        return res.status(500).json({ message: 'Error de base de datos' });
      }

      res.json({
        categoryStats,
        totalStats: totalStats || { total_expenses: 0, total_amount: 0, avg_amount: 0 }
      });
    });
  });
});

module.exports = router;