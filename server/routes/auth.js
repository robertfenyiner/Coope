const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, paymentCycle = 'monthly', reminderDaysBefore = 3 } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Check if user already exists
    db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username], async (err, existingUser) => {
      if (err) {
        return res.status(500).json({ message: 'Error de base de datos' });
      }

      if (existingUser) {
        return res.status(400).json({ message: 'El usuario ya existe' });
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Insert user
      db.run(
        'INSERT INTO users (username, email, password_hash, report_emails_enabled, payment_cycle, reminder_days_before) VALUES (?, ?, ?, 1, ?, ?)',
        [username, email, passwordHash, paymentCycle, reminderDaysBefore],
        function(err) {
          if (err) {
            return res.status(500).json({ message: 'Error al crear el usuario' });
          }

          const userId = this.lastID;

          // Create default categories for new user
          const defaultCategories = [
            { name: 'Comida y restaurante', color: '#EF4444', icon: 'utensils' },
            { name: 'Transporte', color: '#3B82F6', icon: 'car' },
            { name: 'Compras', color: '#10B981', icon: 'shopping-bag' },
            { name: 'Entretenimiento', color: '#F59E0B', icon: 'film' },
            { name: 'Facturas y servicios', color: '#8B5CF6', icon: 'receipt' },
            { name: 'Salud y fitness', color: '#EC4899', icon: 'heart' },
            { name: 'Suscripciones', color: '#6366F1', icon: 'credit-card' }
          ];

          const insertCategory = db.prepare('INSERT INTO categories (user_id, name, color, icon) VALUES (?, ?, ?, ?)');
          
          defaultCategories.forEach(category => {
            insertCategory.run([userId, category.name, category.color, category.icon]);
          });
          
          insertCategory.finalize();

          // Generate JWT token
          const token = jwt.sign(
            { userId: userId },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
          );

          res.status(201).json({
            message: 'Usuario creado correctamente',
            token,
            user: {
              id: userId,
              username,
              email,
              reportEmailsEnabled: true,
              paymentCycle,
              reminderDaysBefore
            }
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'El correo y la contraseña son obligatorios' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        return res.status(500).json({ message: 'Error de base de datos' });
      }

      if (!user) {
        return res.status(400).json({ message: 'Credenciales inválidas' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        return res.status(400).json({ message: 'Credenciales inválidas' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      res.json({
        message: 'Inicio de sesión exitoso',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          reportEmailsEnabled: !!user.report_emails_enabled,
          paymentCycle: user.payment_cycle,
          reminderDaysBefore: user.reminder_days_before
        }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// Update profile
router.put('/profile', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { username, email, reportEmailsEnabled, paymentCycle = 'monthly', reminderDaysBefore = 3 } = req.body;

    if (!username || !email) {
      return res.status(400).json({ message: 'El nombre de usuario y el correo son obligatorios' });
    }

    db.run(
      'UPDATE users SET username = ?, email = ?, report_emails_enabled = ?, payment_cycle = ?, reminder_days_before = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [username, email, reportEmailsEnabled ? 1 : 0, paymentCycle, reminderDaysBefore, userId],
      function(err) {
        if (err) {
          return res.status(500).json({ message: 'Error al actualizar el perfil' });
        }

        res.json({
          message: 'Perfil actualizado correctamente',
          user: {
            id: userId,
            username,
            email,
            reportEmailsEnabled: !!reportEmailsEnabled,
            paymentCycle,
            reminderDaysBefore
          }
        });
      }
    );
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// Get current user
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    user: req.user
  });
});

// Change password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'La contraseña actual y la nueva son obligatorias' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    db.get('SELECT password_hash FROM users WHERE id = ?', [userId], async (err, user) => {
      if (err) {
        return res.status(500).json({ message: 'Error de base de datos' });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);

      if (!isValidPassword) {
        return res.status(400).json({ message: 'La contraseña actual es incorrecta' });
      }

      const saltRounds = 12;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      db.run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
        [newPasswordHash, userId], 
        function(err) {
          if (err) {
            return res.status(500).json({ message: 'Error al actualizar la contraseña' });
          }

          res.json({ message: 'Contraseña actualizada correctamente' });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

module.exports = router;