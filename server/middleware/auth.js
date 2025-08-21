const jwt = require('jsonwebtoken');
const db = require('../database');
const { promisify } = require('util');

// Promisificar operaciones de base de datos para evitar callback hell y race conditions
const dbGet = promisify(db.get.bind(db));

const authMiddleware = async (req, res, next) => {
  try {
    // Extraer y validar token
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Acceso denegado. Formato de token inválido.' });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return res.status(401).json({ message: 'Acceso denegado. No se proporcionó token.' });
    }

    // Verificar token JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      // Registrar error para monitoreo pero no exponer detalles
      console.error('Falló verificación JWT:', jwtError.message);
      return res.status(401).json({ message: 'Token inválido o expirado.' });
    }

    // Validar estructura del token decodificado
    if (!decoded || !decoded.userId || typeof decoded.userId !== 'number') {
      console.error('Payload de token inválido:', decoded);
      return res.status(401).json({ message: 'Payload de token inválido.' });
    }

    // Verificar que el usuario aún exista en la base de datos
    let user;
    try {
      user = await dbGet('SELECT id, username, email, created_at, report_emails_enabled FROM users WHERE id = ?', [decoded.userId]);
    } catch (dbError) {
      console.error('Error de base de datos durante autenticación:', dbError);
      return res.status(500).json({ message: 'Servicio de autenticación temporalmente no disponible.' });
    }

    if (!user) {
      console.warn(`Intento de autenticación con ID de usuario inexistente: ${decoded.userId}`);
      return res.status(401).json({ message: 'Usuario no encontrado.' });
    }

    // Agregar información de usuario al objeto request
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      created_at: user.created_at,
      reportEmailsEnabled: !!user.report_emails_enabled
    };

    // Agregar información de token para funcionalidad potencial de logout/blacklist
    req.tokenPayload = decoded;
    
    next();
  } catch (error) {
    // Capturar cualquier error inesperado
    console.error('Error inesperado en middleware de auth:', error);
    res.status(500).json({ message: 'Error del servicio de autenticación.' });
  }
};

module.exports = authMiddleware;