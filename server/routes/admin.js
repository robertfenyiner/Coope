const express = require('express');
const db = require('../database');
const authMiddleware = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Admin authentication middleware
const adminMiddleware = (req, res, next) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ message: 'Acceso denegado. Se requieren permisos de administrador.' });
  }
  next();
};

// Get all users (admin only)
router.get('/users', authMiddleware, adminMiddleware, (req, res) => {
  const { page = 1, limit = 50, search } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT 
      u.id,
      u.username,
      u.email,
      u.is_admin,
      u.created_at,
      u.updated_at,
      COUNT(e.id) as expense_count,
      SUM(COALESCE(e.amount_cop, e.amount)) as total_spent_cop
    FROM users u
    LEFT JOIN expenses e ON u.id = e.user_id
    WHERE 1=1
  `;

  const params = [];

  if (search) {
    query += ' AND (u.username LIKE ? OR u.email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, users) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    const countParams = [];

    if (search) {
      countQuery += ' AND (username LIKE ? OR email LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    db.get(countQuery, countParams, (err, countResult) => {
      if (err) {
        return res.status(500).json({ message: 'Error de base de datos' });
      }

      res.json({
        users: users.map(user => ({
          ...user,
          total_spent_cop: user.total_spent_cop || 0
        })),
        total: countResult.total,
        page: parseInt(page),
        totalPages: Math.ceil(countResult.total / limit)
      });
    });
  });
});

// Delete user (admin only)
router.delete('/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const userId = req.params.id;
  const adminId = req.user.id;

  // Prevent admin from deleting themselves
  if (parseInt(userId) === adminId) {
    return res.status(400).json({ message: 'No puedes eliminar tu propia cuenta de administrador' });
  }

  // Check if user exists
  db.get('SELECT id, username, is_admin FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Prevent deletion of other admin users
    if (user.is_admin) {
      return res.status(400).json({ message: 'No se pueden eliminar cuentas de administrador' });
    }

    // Delete user (cascade will handle related records)
    db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
      if (err) {
        console.error('Error deleting user:', err);
        return res.status(500).json({ message: 'Error al eliminar el usuario' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      res.json({
        message: `Usuario '${user.username}' eliminado correctamente`,
        deletedUserId: userId
      });
    });
  });
});

// Create new user (admin only)
router.post('/users', authMiddleware, adminMiddleware, async (req, res) => {
  const { username, email, password, isAdmin = false } = req.body;

  // Validation
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  if (username.length < 3) {
    return res.status(400).json({ message: 'El nombre de usuario debe tener al menos 3 caracteres' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
  }

  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ message: 'El email no es válido' });
  }

  try {
    // Check if username or email already exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    if (existingUser) {
      return res.status(400).json({ message: 'El nombre de usuario o email ya existe' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    db.run(
      'INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, isAdmin ? 1 : 0],
      function(err) {
        if (err) {
          console.error('Error creating user:', err);
          return res.status(500).json({ message: 'Error al crear el usuario' });
        }

        res.status(201).json({
          message: 'Usuario creado correctamente',
          userId: this.lastID,
          username: username
        });
      }
    );

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error al crear el usuario' });
  }
});

// Update user (admin only)
router.put('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const userId = req.params.id;
  const { username, email, password, isAdmin } = req.body;

  // Validation
  if (!username || !email) {
    return res.status(400).json({ message: 'Nombre de usuario y email son obligatorios' });
  }

  if (username.length < 3) {
    return res.status(400).json({ message: 'El nombre de usuario debe tener al menos 3 caracteres' });
  }

  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ message: 'El email no es válido' });
  }

  if (password && password.length < 6) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    // Check if username or email already exists (excluding current user)
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?', [username, email, userId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    if (existingUser) {
      return res.status(400).json({ message: 'El nombre de usuario o email ya existe' });
    }

    let updateQuery = 'UPDATE users SET username = ?, email = ?, is_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    let updateParams = [username, email, isAdmin ? 1 : 0, userId];

    // If password is provided, hash it and include in update
    if (password) {
      const passwordHash = await bcrypt.hash(password, 12);
      updateQuery = 'UPDATE users SET username = ?, email = ?, password_hash = ?, is_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      updateParams = [username, email, passwordHash, isAdmin ? 1 : 0, userId];
    }

    db.run(updateQuery, updateParams, function(err) {
      if (err) {
        console.error('Error updating user:', err);
        return res.status(500).json({ message: 'Error al actualizar el usuario' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      res.json({
        message: 'Usuario actualizado correctamente',
        userId: userId
      });
    });

  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error al actualizar el usuario' });
  }
});

// Toggle user admin status (admin only)
router.patch('/users/:id/admin', authMiddleware, adminMiddleware, (req, res) => {
  const userId = req.params.id;
  const adminId = req.user.id;
  const { isAdmin } = req.body;

  // Prevent admin from removing their own admin status
  if (parseInt(userId) === adminId && !isAdmin) {
    return res.status(400).json({ message: 'No puedes quitar tus propios permisos de administrador' });
  }

  db.run(
    'UPDATE users SET is_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [isAdmin ? 1 : 0, userId],
    function(err) {
      if (err) {
        console.error('Error updating user admin status:', err);
        return res.status(500).json({ message: 'Error al actualizar permisos' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      res.json({
        message: `Permisos de administrador ${isAdmin ? 'otorgados' : 'removidos'} correctamente`,
        userId: userId
      });
    }
  );
});

// Get system statistics (admin only)
router.get('/stats', authMiddleware, adminMiddleware, (req, res) => {
  const queries = {
    totalUsers: 'SELECT COUNT(*) as count FROM users',
    totalExpenses: 'SELECT COUNT(*) as count FROM expenses',
    totalAmountCop: 'SELECT SUM(COALESCE(amount_cop, amount)) as total FROM expenses',
    totalCategories: 'SELECT COUNT(*) as count FROM categories',
    adminUsers: 'SELECT COUNT(*) as count FROM users WHERE is_admin = 1',
    recentUsers: `
      SELECT username, email, created_at 
      FROM users 
      WHERE is_admin = 0
      ORDER BY created_at DESC 
      LIMIT 5
    `,
    expensesByMonth: `
      SELECT 
        strftime('%Y-%m', date) as month,
        COUNT(*) as expense_count,
        SUM(COALESCE(amount_cop, amount)) as total_amount
      FROM expenses 
      WHERE date >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month DESC
    `,
    topCategories: `
      SELECT 
        c.name,
        c.color,
        COUNT(e.id) as expense_count,
        SUM(COALESCE(e.amount_cop, e.amount)) as total_amount
      FROM categories c
      LEFT JOIN expenses e ON c.id = e.category_id
      GROUP BY c.id
      ORDER BY total_amount DESC
      LIMIT 10
    `
  };

  const results = {};
  let completedQueries = 0;
  const totalQueries = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, query]) => {
    const isArrayQuery = ['recentUsers', 'expensesByMonth', 'topCategories'].includes(key);
    
    const method = isArrayQuery ? 'all' : 'get';
    db[method](query, (err, data) => {
      if (err) {
        console.error(`Error in ${key} query:`, err);
        results[key] = isArrayQuery ? [] : { count: 0 };
      } else {
        results[key] = data;
      }

      completedQueries++;
      if (completedQueries === totalQueries) {
        res.json({
          stats: {
            totalUsers: results.totalUsers?.count || 0,
            totalExpenses: results.totalExpenses?.count || 0,
            totalAmountCop: results.totalAmountCop?.total || 0,
            totalCategories: results.totalCategories?.count || 0,
            adminUsers: results.adminUsers?.count || 0
          },
          recentUsers: results.recentUsers || [],
          expensesByMonth: results.expensesByMonth || [],
          topCategories: results.topCategories || []
        });
      }
    });
  });
});

// Get email templates (admin only)
router.get('/email-templates', authMiddleware, adminMiddleware, (req, res) => {
  db.all('SELECT * FROM email_templates ORDER BY template_name', (err, templates) => {
    if (err) {
      console.error('Error fetching email templates:', err);
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    res.json({ templates });
  });
});

// Update email template (admin only)
router.put('/email-templates/:templateName', authMiddleware, adminMiddleware, (req, res) => {
  const { templateName } = req.params;
  const { subject, html_content, text_content } = req.body;

  if (!subject || !html_content || !text_content) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  db.run(
    `UPDATE email_templates 
     SET subject = ?, html_content = ?, text_content = ?, updated_at = CURRENT_TIMESTAMP 
     WHERE template_name = ?`,
    [subject, html_content, text_content, templateName],
    function(err) {
      if (err) {
        console.error('Error updating email template:', err);
        return res.status(500).json({ message: 'Error al actualizar la plantilla' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Plantilla no encontrada' });
      }

      res.json({
        message: 'Plantilla actualizada correctamente',
        templateName: templateName
      });
    }
  );
});

// Create new email template (admin only)
router.post('/email-templates', authMiddleware, adminMiddleware, (req, res) => {
  const { template_name, subject, html_content, text_content } = req.body;

  if (!template_name || !subject || !html_content || !text_content) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  db.run(
    'INSERT INTO email_templates (template_name, subject, html_content, text_content) VALUES (?, ?, ?, ?)',
    [template_name, subject, html_content, text_content],
    function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return res.status(400).json({ message: 'Ya existe una plantilla con ese nombre' });
        }
        console.error('Error creating email template:', err);
        return res.status(500).json({ message: 'Error al crear la plantilla' });
      }

      res.status(201).json({
        message: 'Plantilla creada correctamente',
        templateId: this.lastID,
        templateName: template_name
      });
    }
  );
});

// Delete email template (admin only)
router.delete('/email-templates/:templateName', authMiddleware, adminMiddleware, (req, res) => {
  const { templateName } = req.params;

  // Prevent deletion of system templates
  const systemTemplates = ['expense_reminder', 'test_email'];
  if (systemTemplates.includes(templateName)) {
    return res.status(400).json({ message: 'No se pueden eliminar las plantillas del sistema' });
  }

  db.run('DELETE FROM email_templates WHERE template_name = ?', [templateName], function(err) {
    if (err) {
      console.error('Error deleting email template:', err);
      return res.status(500).json({ message: 'Error al eliminar la plantilla' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: 'Plantilla no encontrada' });
    }

    res.json({
      message: 'Plantilla eliminada correctamente',
      templateName: templateName
    });
  });
});

// Preview email template (admin only)
router.post('/email-templates/:templateName/preview', authMiddleware, adminMiddleware, (req, res) => {
  const { templateName } = req.params;
  const { sampleData = {} } = req.body;

  db.get('SELECT * FROM email_templates WHERE template_name = ?', [templateName], (err, template) => {
    if (err) {
      console.error('Error fetching template:', err);
      return res.status(500).json({ message: 'Error de base de datos' });
    }

    if (!template) {
      return res.status(404).json({ message: 'Plantilla no encontrada' });
    }

    // Replace template variables with sample data
    const defaultSampleData = {
      user_name: 'Juan Pérez',
      expense_description: 'Netflix Subscription',
      expense_amount: '$15.99',
      due_date: new Date().toISOString().split('T')[0],
      days_advance: '3'
    };

    const mergedData = { ...defaultSampleData, ...sampleData };

    let previewSubject = template.subject;
    let previewHtml = template.html_content;
    let previewText = template.text_content;

    // Replace variables in all fields
    Object.entries(mergedData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      previewSubject = previewSubject.replace(regex, value);
      previewHtml = previewHtml.replace(regex, value);
      previewText = previewText.replace(regex, value);
    });

    res.json({
      template: {
        ...template,
        subject: previewSubject,
        html_content: previewHtml,
        text_content: previewText
      },
      sampleData: mergedData
    });
  });
});

module.exports = router;