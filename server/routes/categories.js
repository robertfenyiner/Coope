const express = require('express');
const db = require('../database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get all categories for user
router.get('/', authMiddleware, (req, res) => {
  const userId = req.user.id;

  const query = `
    SELECT c.*, 
           COUNT(e.id) as expense_count,
           COALESCE(SUM(e.amount), 0) as total_amount
    FROM categories c
    LEFT JOIN expenses e ON c.id = e.category_id
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY c.name ASC
  `;

  db.all(query, [userId], (err, categories) => {
    if (err) {
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    res.json(categories);
  });
});

// Get category by ID
router.get('/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const categoryId = req.params.id;

  const query = `
    SELECT c.*, 
           COUNT(e.id) as expense_count,
           COALESCE(SUM(e.amount), 0) as total_amount
    FROM categories c
    LEFT JOIN expenses e ON c.id = e.category_id
    WHERE c.id = ? AND c.user_id = ?
    GROUP BY c.id
  `;

  db.get(query, [categoryId, userId], (err, category) => {
    if (err) {
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    res.json(category);
  });
});

// Create new category
router.post('/', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { name, color = '#3B82F6', icon = 'folder' } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'El nombre de la categoría es obligatorio' });
  }

  if (name.length > 100) {
    return res.status(400).json({ message: 'El nombre de la categoría debe tener 100 caracteres o menos' });
  }

  // Check if category name already exists for this user
  db.get('SELECT id FROM categories WHERE user_id = ? AND name = ?', [userId, name], (err, existingCategory) => {
    if (err) {
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    if (existingCategory) {
      return res.status(400).json({ message: 'Ya existe una categoría con este nombre' });
    }

    const query = 'INSERT INTO categories (user_id, name, color, icon) VALUES (?, ?, ?, ?)';

    db.run(query, [userId, name, color, icon], function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error al crear la categoría' });
      }

      // Get the created category
      db.get('SELECT * FROM categories WHERE id = ?', [this.lastID], (err, category) => {
        if (err) {
          return res.status(500).json({ message: 'Error al obtener la categoría creada' });
        }

        res.status(201).json({
          message: 'Categoría creada correctamente',
          category: {
            ...category,
            expense_count: 0,
            total_amount: 0
          }
        });
      });
    });
  });
});

// Update category
router.put('/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const categoryId = req.params.id;
  const { name, color, icon } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'El nombre de la categoría es obligatorio' });
  }

  if (name.length > 100) {
    return res.status(400).json({ message: 'El nombre de la categoría debe tener 100 caracteres o menos' });
  }

  // Check if category name already exists for this user (excluding current category)
  db.get('SELECT id FROM categories WHERE user_id = ? AND name = ? AND id != ?', 
    [userId, name, categoryId], (err, existingCategory) => {
    if (err) {
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    if (existingCategory) {
      return res.status(400).json({ message: 'Ya existe una categoría con este nombre' });
    }

    const query = `
      UPDATE categories 
      SET name = ?, color = ?, icon = ?
      WHERE id = ? AND user_id = ?
    `;

    db.run(query, [name, color, icon, categoryId, userId], function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error al actualizar la categoría' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Categoría no encontrada' });
      }

      // Get the updated category with stats
      const selectQuery = `
        SELECT c.*, 
               COUNT(e.id) as expense_count,
               COALESCE(SUM(e.amount), 0) as total_amount
        FROM categories c
        LEFT JOIN expenses e ON c.id = e.category_id
        WHERE c.id = ?
        GROUP BY c.id
      `;

      db.get(selectQuery, [categoryId], (err, category) => {
        if (err) {
          return res.status(500).json({ message: 'Error al obtener la categoría actualizada' });
        }

        res.json({
          message: 'Categoría actualizada correctamente',
          category
        });
      });
    });
  });
});

// Delete category
router.delete('/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const categoryId = req.params.id;

  // Check if category has expenses
  db.get('SELECT COUNT(*) as count FROM expenses WHERE category_id = ?', [categoryId], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    if (result.count > 0) {
      return res.status(400).json({
        message: 'No se puede eliminar la categoría porque tiene gastos asociados. Mueve o elimina todos los gastos primero.'
      });
    }

    db.run('DELETE FROM categories WHERE id = ? AND user_id = ?', [categoryId, userId], function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error al eliminar la categoría' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Categoría no encontrada' });
      }

      res.json({ message: 'Categoría eliminada correctamente' });
    });
  });
});

module.exports = router;