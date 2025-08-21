const express = require('express');
const db = require('../database');
const authMiddleware = require('../middleware/auth');
const currencyService = require('../services/currencyService');

const router = express.Router();

// Get all expenses for user
router.get('/', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 50, category, startDate, endDate, search, sortBy = 'date', sortOrder = 'desc' } = req.query;
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

  // Dynamic sorting
  const validSortFields = {
    'date': 'e.date',
    'amount': 'e.amount',
    'description': 'e.description',
    'category': 'c.name'
  };
  
  const sortField = validSortFields[sortBy] || 'e.date';
  const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
  
  query += ` ORDER BY ${sortField} ${order}, e.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, expenses) => {
    if (err) {
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    // Log para verificar datos de recurrencia
    if (expenses.length > 0) {
      console.log('Primer gasto recuperado:', {
        id: expenses[0].id,
        description: expenses[0].description,
        is_recurring: expenses[0].is_recurring,
        recurring_frequency: expenses[0].recurring_frequency,
        reminder_days_advance: expenses[0].reminder_days_advance
      });
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
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  
  // Log para depuración
  console.log('Datos recibidos en backend:', req.body);
  
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
    reminderDaysAdvance = 1
  } = req.body;
  
  console.log('Valores extraídos - isRecurring:', isRecurring, 'recurringFrequency:', recurringFrequency);

  const resolvedCategoryId = categoryId || category_id;
  const resolvedCurrencyId = currencyId || currency_id;

  if (!resolvedCategoryId || !resolvedCurrencyId || !amount || !description || !date) {
    return res.status(400).json({ message: 'Todos los campos obligatorios deben proporcionarse' });
  }

  if (amount <= 0) {
    return res.status(400).json({ message: 'El monto debe ser mayor a 0' });
  }

  // Validate reminderDaysAdvance
  if (reminderDaysAdvance < 1 || reminderDaysAdvance > 3) {
    return res.status(400).json({ message: 'Los días de anticipación deben ser entre 1 y 3' });
  }

  try {
    // Get currency information
    const currency = await new Promise((resolve, reject) => {
      db.get('SELECT code FROM currencies WHERE id = ?', [resolvedCurrencyId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    if (!currency) {
      return res.status(400).json({ message: 'Moneda no válida' });
    }

    // Convert to COP if not already in COP
    let copAmount = null;
    let exchangeRate = null;
    
    if (currency.code !== 'COP') {
      try {
        const conversion = await currencyService.convertToCOP(amount, currency.code);
        copAmount = conversion.copAmount;
        exchangeRate = conversion.exchangeRate;
      } catch (error) {
        console.error('Error converting to COP:', error);
        // Continue without conversion if exchange rate service fails
      }
    } else {
      copAmount = amount;
      exchangeRate = 1;
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
      (user_id, category_id, currency_id, amount, amount_cop, exchange_rate, description, date, is_recurring, recurring_frequency, next_due_date, reminder_days_advance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [
      userId, resolvedCategoryId, resolvedCurrencyId, amount, copAmount, exchangeRate, description, date,
      isRecurring ? 1 : 0, recurringFrequency, nextDueDate?.toISOString().split('T')[0], reminderDaysAdvance
    ], function(err) {
      if (err) {
        console.error('Database error creating expense:', err);
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

          // Log para verificar que se guardó la recurrencia
          console.log('Gasto guardado en BD:', {
            id: expense.id,
            description: expense.description,
            is_recurring: expense.is_recurring,
            recurring_frequency: expense.recurring_frequency,
            reminder_days_advance: expense.reminder_days_advance
          });

          res.status(201).json({
            message: 'Gasto creado correctamente',
            expense
          });
        });
    });

  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ message: 'Error al crear el gasto' });
  }
});

// Update expense
router.put('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const expenseId = req.params.id;
  
  // Log para depuración
  console.log('Datos recibidos en PUT:', req.body);
  
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
    reminderDaysAdvance = 1
  } = req.body;
  
  console.log('PUT - isRecurring:', isRecurring, 'recurringFrequency:', recurringFrequency);

  const resolvedCategoryId = categoryId || category_id;
  const resolvedCurrencyId = currencyId || currency_id;

  if (!resolvedCategoryId || !resolvedCurrencyId || !amount || !description || !date) {
    return res.status(400).json({ message: 'Todos los campos obligatorios deben proporcionarse' });
  }

  if (amount <= 0) {
    return res.status(400).json({ message: 'El monto debe ser mayor a 0' });
  }

  // Validate reminderDaysAdvance
  if (reminderDaysAdvance < 1 || reminderDaysAdvance > 3) {
    return res.status(400).json({ message: 'Los días de anticipación deben ser entre 1 y 3' });
  }

  try {
    // Get currency information
    const currency = await new Promise((resolve, reject) => {
      db.get('SELECT code FROM currencies WHERE id = ?', [resolvedCurrencyId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    if (!currency) {
      return res.status(400).json({ message: 'Moneda no válida' });
    }

    // Convert to COP if not already in COP
    let copAmount = null;
    let exchangeRate = null;
    
    if (currency.code !== 'COP') {
      try {
        const conversion = await currencyService.convertToCOP(amount, currency.code);
        copAmount = conversion.copAmount;
        exchangeRate = conversion.exchangeRate;
      } catch (error) {
        console.error('Error converting to COP:', error);
        // Continue without conversion if exchange rate service fails
      }
    } else {
      copAmount = amount;
      exchangeRate = 1;
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
      SET category_id = ?, currency_id = ?, amount = ?, amount_cop = ?, exchange_rate = ?, description = ?, date = ?, 
          is_recurring = ?, recurring_frequency = ?, next_due_date = ?, reminder_days_advance = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `;

    db.run(query, [
      resolvedCategoryId, resolvedCurrencyId, amount, copAmount, exchangeRate, description, date,
      isRecurring ? 1 : 0, recurringFrequency, nextDueDate?.toISOString().split('T')[0], reminderDaysAdvance,
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

        // Log para verificar que se actualizó la recurrencia
        console.log('Gasto actualizado en BD:', {
          id: expense.id,
          description: expense.description,
          is_recurring: expense.is_recurring,
          recurring_frequency: expense.recurring_frequency,
          reminder_days_advance: expense.reminder_days_advance
        });

        res.json({
          message: 'Gasto actualizado correctamente',
          expense
        });
      });
    });

  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ message: 'Error al actualizar el gasto' });
  }
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

// Get recurring expenses (for debugging)
router.get('/recurring', authMiddleware, (req, res) => {
  const userId = req.user.id;

  const query = `
    SELECT e.id, e.description, e.is_recurring, e.recurring_frequency, e.reminder_days_advance,
           e.next_due_date, e.created_at, e.updated_at,
           c.name as category_name, cur.code as currency_code
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    JOIN currencies cur ON e.currency_id = cur.id
    WHERE e.user_id = ? AND e.is_recurring = 1
    ORDER BY e.created_at DESC
  `;

  db.all(query, [userId], (err, expenses) => {
    if (err) {
      console.error('Error fetching recurring expenses:', err);
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    console.log(`Gastos recurrentes encontrados: ${expenses.length}`);
    expenses.forEach(expense => {
      console.log(`- ${expense.description}: recurring=${expense.is_recurring}, frequency=${expense.recurring_frequency}`);
    });

    res.json({
      count: expenses.length,
      expenses
    });
  });
});

// Get currency breakdown with COP equivalents
router.get('/stats/currency-summary', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { startDate, endDate } = req.query;

  let query = `
    SELECT 
      cur.code as currency_code,
      cur.name as currency_name,
      cur.symbol as currency_symbol,
      COUNT(e.id) as expense_count,
      SUM(e.amount) as total_amount_original,
      SUM(COALESCE(e.amount_cop, e.amount)) as total_amount_cop,
      AVG(e.amount) as avg_amount_original,
      AVG(COALESCE(e.amount_cop, e.amount)) as avg_amount_cop
    FROM expenses e
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

  query += ' GROUP BY cur.id, cur.code, cur.name, cur.symbol ORDER BY total_amount_cop DESC';

  db.all(query, params, (err, currencyStats) => {
    if (err) {
      console.error('Database error in currency summary:', err);
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    // Get total COP summary
    let totalQuery = `
      SELECT 
        COUNT(e.id) as total_expenses,
        SUM(COALESCE(e.amount_cop, e.amount)) as total_amount_cop
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
        console.error('Database error in total summary:', err);
        return res.status(500).json({ message: 'Error de base de datos' });
      }

      res.json({
        currencyStats: currencyStats || [],
        totalStats: totalStats || { total_expenses: 0, total_amount_cop: 0 }
      });
    });
  });
});

module.exports = router;