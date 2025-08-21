const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const authMiddleware = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

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
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [username, email, passwordHash],
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
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
          );

          res.status(201).json({
            message: 'Usuario creado correctamente',
            token,
            user: {
              id: userId,
              username,
              email,
              is_admin: false,
              profile_picture: null
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

    db.get('SELECT id, username, email, password_hash, is_admin, profile_picture FROM users WHERE email = ?', [email], async (err, user) => {
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
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({
        message: 'Inicio de sesión exitoso',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          is_admin: user.is_admin,
          profile_picture: user.profile_picture
        }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// Get current user
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    user: req.user,
    tokenInfo: {
      issuedAt: new Date(req.tokenPayload.iat * 1000).toISOString(),
      expiresAt: new Date(req.tokenPayload.exp * 1000).toISOString(),
      timeRemaining: Math.max(0, req.tokenPayload.exp * 1000 - Date.now())
    }
  });
});

// Refresh JWT token
router.post('/refresh', authMiddleware, (req, res) => {
  try {
    const user = req.user;
    
    // Generate new JWT token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Token renovado exitosamente',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin,
        profile_picture: user.profile_picture
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
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

// Test email functionality
router.post('/test-email', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const { testEmail } = req.body;

    // Check if email service is configured
    if (!emailService.transporter) {
      return res.status(503).json({ 
        message: 'El servicio de correo electrónico no está configurado' 
      });
    }

    // Validate email if provided
    let recipientEmail = user.email;
    if (testEmail) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(testEmail)) {
        return res.status(400).json({ 
          message: 'El formato del correo electrónico no es válido' 
        });
      }
      recipientEmail = testEmail;
    }

    // Create a user object for the test email
    const testUser = {
      ...user,
      email: recipientEmail
    };

    // Send test email
    await emailService.sendTestEmail(testUser);
    
    res.json({ 
      message: 'Correo de prueba enviado exitosamente',
      recipient: recipientEmail
    });

  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ 
      message: 'Error al enviar el correo de prueba',
      error: error.message 
    });
  }
});

module.exports = router;