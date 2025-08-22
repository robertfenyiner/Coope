const jwt = require('jsonwebtoken');
const { query } = require('../database');

// Función helper para obtener usuario por ID
const getUsuarioPorId = async (id) => {
  try {
    // Si no hay base de datos disponible, simular usuario para desarrollo
    if (process.env.DB_HOST === undefined && process.env.NODE_ENV === 'development') {
      return {
        id: id,
        username: 'dev_user',
        email: 'dev@coopeenortol.com',
        es_admin: true,
        creado_en: new Date()
      };
    }
    
    const result = await query('SELECT id, username, email, es_admin, creado_en FROM usuarios WHERE id = $1', [id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    return null;
  }
};

const authMiddleware = async (req, res, next) => {
  try {
    // Log de debug para diagnosticar problemas
    console.log(`[AUTH] ${req.method} ${req.path} - IP: ${req.ip}`);
    
    // Extraer y validar token
    const authHeader = req.header('Authorization');
    console.log(`[AUTH] Authorization header: ${authHeader ? 'Present' : 'Missing'}`);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log(`[AUTH] Invalid authorization header format`);
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
    if (!decoded || !decoded.userId || typeof decoded.userId !== 'string') {
      console.error('Payload de token inválido:', decoded);
      return res.status(401).json({ message: 'Payload de token inválido.' });
    }

    // Verificar que el usuario aún exista en la base de datos
    let user;
    try {
      user = await getUsuarioPorId(decoded.userId);
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
      is_admin: user.es_admin,
      created_at: user.creado_en
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