const express = require('express');
const axios = require('axios');
const db = require('../database');
const authMiddleware = require('../middleware/auth');
const currencyService = require('../services/currencyService');

const router = express.Router();

// Get all currencies
router.get('/', authMiddleware, (req, res) => {
  db.all('SELECT * FROM currencies ORDER BY code ASC', (err, currencies) => {
    if (err) {
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    res.json(currencies);
  });
});

// Update exchange rates manually
router.post('/update-rates', authMiddleware, async (req, res) => {
  try {
    await currencyService.updateExchangeRates();
    res.json({
      message: 'Actualización de tasas de cambio iniciada correctamente',
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al actualizar las tasas de cambio. Por favor intenta de nuevo más tarde.',
      error: error.message
    });
  }
});

// Convert amount between currencies
router.post('/convert', authMiddleware, async (req, res) => {
  try {
    const { amount, fromCurrency, toCurrency } = req.body;

    if (!amount || !fromCurrency || !toCurrency) {
      return res.status(400).json({
        message: 'Se requieren monto, moneda origen y moneda destino'
      });
    }

    const result = await currencyService.convertCurrency(amount, fromCurrency, toCurrency);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get currency usage statistics
router.get('/stats', authMiddleware, (req, res) => {
  const userId = req.user.id;

  const query = `
    SELECT 
      cur.code,
      cur.name,
      cur.symbol,
      COUNT(e.id) as expense_count,
      SUM(e.amount) as total_amount
    FROM currencies cur
    LEFT JOIN expenses e ON cur.id = e.currency_id AND e.user_id = ?
    GROUP BY cur.id
    HAVING expense_count > 0
    ORDER BY total_amount DESC
  `;

  db.all(query, [userId], (err, stats) => {
    if (err) {
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    res.json(stats);
  });
});

module.exports = router;