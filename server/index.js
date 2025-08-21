// Cargar variables de entorno desde el archivo .env
// Esto debe ser la primera línea para asegurar que todas las configuraciones estén disponibles
require('dotenv').config();

// Importar librerías principales de Express y middleware de seguridad
const express = require('express');
const cors = require('cors');              // Control de acceso entre orígenes (CORS)
const helmet = require('helmet');          // Headers de seguridad HTTP
const rateLimit = require('express-rate-limit'); // Limitación de velocidad para prevenir ataques
const path = require('path');              // Manejo de rutas de archivos

// Inicializar la base de datos SQLite y crear tablas si no existen
// Esto debe ejecutarse temprano para asegurar que la BD esté lista
require('./database');

// Inicializar el servicio de envío de emails para recordatorios y notificaciones
// Configura nodemailer y schedules para envío automático de emails
require('./services/emailService');

// Inicializar el servicio de monedas para conversión de tipos de cambio
// Configura las tasas de cambio automáticas usando APIs externas
require('./services/currencyService');

// Importar todas las rutas de la API REST
// Cada archivo de rutas maneja un grupo específico de endpoints
const authRoutes = require('./routes/auth');         // Autenticación: login, registro, JWT
const expenseRoutes = require('./routes/expenses');   // Gestión de gastos: CRUD, filtros, reportes
const categoryRoutes = require('./routes/categories'); // Gestión de categorías personalizadas
const currencyRoutes = require('./routes/currencies'); // Gestión de monedas soportadas
const reportRoutes = require('./routes/reports');     // Generación de reportes PDF y Excel
const adminRoutes = require('./routes/admin');       // Panel de administración para usuarios admin
const backupRoutes = require('./routes/backup');     // Sistema de respaldos de la base de datos
const fileRoutes = require('./routes/files');       // Gestión de archivos adjuntos y fotos de perfil

// Crear instancia de la aplicación Express
const app = express();

// Configurar Express para confiar en proxies (como Nginx)
// Esto es esencial para obtener la IP real del cliente cuando se usa proxy reverso
app.set('trust proxy', 1);

// Definir el puerto del servidor - usar variable de entorno o puerto 5000 por defecto
const PORT = process.env.PORT || 5000;

// ========================================
// CONFIGURACIÓN DE SEGURIDAD AVANZADA
// ========================================

// Aplicar middleware de seguridad Helmet.js
// Establece varios headers HTTP de seguridad automáticamente para proteger contra
// ataques comunes como XSS, clickjacking, MIME sniffing, etc.
app.use(helmet());

// Deshabilitar el header X-Powered-By que revela información sobre Express
// Esto evita que atacantes sepan que tecnología está usando el servidor
app.disable('x-powered-by');

// ========================================
// MANEJO DE ERRORES GLOBALES DEL PROCESO
// ========================================

// Manejar excepciones no capturadas en cualquier parte de la aplicación
// Esto previene que el servidor se cuelgue silenciosamente ante errores críticos
process.on('uncaughtException', (err) => {
  console.error(`[${new Date().toISOString()}] ERROR CRÍTICO - Excepción no capturada:`, err);
  console.error('Stack trace completo:', err.stack);
  
  // En el futuro se puede agregar notificación por email o servicio de logs externos
  // Por ejemplo: enviar notificación a administradores sobre el error crítico
  
  // Salir del proceso de forma controlada para evitar estado inconsistente
  process.exit(1);
});

// Manejar promesas rechazadas que no fueron capturadas
// Esto ocurre cuando se usa async/await o .then() sin .catch() apropiado
process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${new Date().toISOString()}] ERROR CRÍTICO - Promesa rechazada no manejada:`, reason);
  console.error('Promesa que falló:', promise);
  
  // En el futuro se puede agregar logging más sofisticado o notificaciones
  // Por ejemplo: integración con servicios como Sentry, LogRocket, etc.
  
  // Salir del proceso para evitar comportamiento impredecible
  process.exit(1);
});

// Validar variables de entorno críticas en producción
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET no está definido o es demasiado corto.');
  }
}

// Limitación de velocidad (Rate limiting) - Configuración más permisiva
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 500, // Aumentado de 100 a 500 requests por ventana
  message: { message: 'Demasiadas peticiones desde esta IP, intente de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // No contar requests exitosos
  skip: (req) => {
    // Omitir rate limiting para health check y static files
    return req.path === '/api/health' || req.path.startsWith('/static/');
  }
});
app.use('/api/', limiter);

// Limitación más estricta para endpoints de autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // Aumentado de 15 a 50 intentos de auth por ventana
  message: { message: 'Demasiados intentos de autenticación, intente de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // No contar requests exitosos hacia el límite
  skip: (req) => {
    // Omitir para testing o IPs locales
    const ip = req.ip || req.connection.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1';
  }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Configuración CORS
const corsOptions = {
  origin: (origin, callback) => {
    // Permitir requests sin origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    // Permitir el origen del frontend en producción
    const defaultDevOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001'];
    let allowedOrigins = defaultDevOrigins;
    if (process.env.NODE_ENV === 'production') {
      if (process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS.trim() !== '') {
        allowedOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
      } else {
        // Detectar IP pública y permitirla automáticamente
        const publicIp = process.env.PUBLIC_IP || null;
        if (publicIp) {
          allowedOrigins = [`http://${publicIp}`];
        }
      }
    }
    // Mostrar orígenes permitidos en consola para depuración
    if (process.env.NODE_ENV === 'production') {
      console.log(`[CORS] Orígenes permitidos:`, allowedOrigins);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`CORS bloqueó petición desde origen: ${origin}`);
    callback(new Error('No permitido por CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200 // Soporte para navegadores legacy
};

app.use(cors(corsOptions));

// Middleware de parseo de body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/currencies', currencyRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/files', fileRoutes);

// Endpoint de verificación de salud
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    app: 'Gastos Robert'
  });
});

// Test page for debugging uploads
app.get('/test-upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-upload.html'));
});

// Endpoint para limpiar rate limiting (solo desarrollo)
app.get('/api/clear-rate-limit', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ message: 'No disponible en producción' });
  }
  
  // Limpiar contadores de rate limiting
  if (limiter.resetKey) {
    limiter.resetKey(req.ip);
  }
  if (authLimiter.resetKey) {
    authLimiter.resetKey(req.ip);
  }
  
  res.json({ 
    message: 'Rate limiting limpiado para tu IP',
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
});

// Endpoint de debug para verificar autenticación
app.get('/api/debug/auth', require('./middleware/auth'), (req, res) => {
  res.json({
    message: 'Autenticación exitosa',
    user: {
      id: req.user.id,
      username: req.user.username,
      is_admin: req.user.is_admin
    },
    timestamp: new Date().toISOString()
  });
});

// Servir archivos estáticos de React en producción
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  // Solo servir index.html si no es una ruta de API
  app.get('*', (req, res) => {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(404).json({ message: 'Endpoint de API no encontrado' });
    }
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Manejador 404 para rutas de API
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'Endpoint de API no encontrado' });
});

// Manejador global de errores
app.use((err, req, res, next) => {
  console.error('Error global:', err); // <-- log más explícito
  res.status(500).json({ 
    message: 'Algo salió mal!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Servidor ejecutándose en puerto ${PORT}`);
  console.log(`[${new Date().toISOString()}] Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[${new Date().toISOString()}] Aplicación: Gastos Robert v1.0`);
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${new Date().toISOString()}] API disponible en: http://localhost:${PORT}/api`);
    console.log(`[${new Date().toISOString()}] Verificación de salud: http://localhost:${PORT}/api/health`);
  }
});

// Elimina module.exports si no usas este archivo como módulo
// module.exports = app;