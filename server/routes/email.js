const express = require('express');
const authMiddleware = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

router.post('/test', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    await emailService.sendTestEmail(user);
    res.json({ message: 'Correo de prueba enviado correctamente' });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ message: 'Error al enviar el correo de prueba', error: error.message });
  }
});

module.exports = router;
