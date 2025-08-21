const express = require('express');
const db = require('../database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

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
      return res.status(500).json({ message: 'Database error' });
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
        return res.status(500).json({ message: 'Database error' });
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
      return res.status(500).json({ message: 'Database error' });
    }

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json(expense);
  });
});

// Create new expense
router.post('/', authMiddleware, (req, res) => {
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
    recurringFrequency = null
  } = req.body;

  const resolvedCategoryId = categoryId || category_id;
  const resolvedCurrencyId = currencyId || currency_id;

  if (!resolvedCategoryId || !resolvedCurrencyId || !amount || !description || !date) {
    return res.status(400).json({ message: 'All required fields must be provided' });
  }

  if (amount <= 0) {
    return res.status(400).json({ message: 'Amount must be greater than 0' });
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

  const query = `
    INSERT INTO expenses 
    (user_id, category_id, currency_id, amount, description, date, is_recurring, recurring_frequency, next_due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [
    userId, resolvedCategoryId, resolvedCurrencyId, amount, description, date,
    isRecurring, recurringFrequency, nextDueDate?.toISOString().split('T')[0]
  ], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Error creating expense' });
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
        return res.status(500).json({ message: 'Error retrieving created expense' });
      }

      res.status(201).json({
        message: 'Expense created successfully',
        expense
      });
    });
  });
});

// Update expense
router.put('/:id', authMiddleware, (req, res) => {
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
    recurringFrequency
  } = req.body;

  const resolvedCategoryId = categoryId || category_id;
  const resolvedCurrencyId = currencyId || currency_id;

  if (!resolvedCategoryId || !resolvedCurrencyId || !amount || !description || !date) {
    return res.status(400).json({ message: 'All required fields must be provided' });
  }

  if (amount <= 0) {
    return res.status(400).json({ message: 'Amount must be greater than 0' });
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

  const query = `
    UPDATE expenses 
    SET category_id = ?, currency_id = ?, amount = ?, description = ?, date = ?, 
        is_recurring = ?, recurring_frequency = ?, next_due_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `;

  db.run(query, [
    resolvedCategoryId, resolvedCurrencyId, amount, description, date,
    isRecurring, recurringFrequency, nextDueDate?.toISOString().split('T')[0],
    expenseId, userId
  ], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Error updating expense' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: 'Expense not found' });
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
        return res.status(500).json({ message: 'Error retrieving updated expense' });
      }

      res.json({
        message: 'Expense updated successfully',
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
      return res.status(500).json({ message: 'Error deleting expense' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json({ message: 'Expense deleted successfully' });
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
      return res.status(500).json({ message: 'Database error' });
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
        return res.status(500).json({ message: 'Database error' });
      }

      res.json({
        categoryStats,
        totalStats: totalStats || { total_expenses: 0, total_amount: 0, avg_amount: 0 }
      });
    });
  });
});

module.exports = router;