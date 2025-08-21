require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Importar base de datos para inicializar tablas
require('./database');

// Inicializar servicio de email
require('./services/emailService');

// Inicializar servicio de monedas
require('./services/currencyService');

// Importar rutas
const authRoutes = require('./routes/auth');
const expenseRoutes = require('./routes/expenses');
const categoryRoutes = require('./routes/categories');
const currencyRoutes = require('./routes/currencies');
const reportRoutes = require('./routes/reports');
const emailRoutes = require('./routes/email');

const app = express();
// Permitir que Express confíe en el proxy (Nginx) para X-Forwarded-For
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// Middleware de seguridad
app.use(helmet());

// Deshabilitar x-powered-by por seguridad
app.disable('x-powered-by');

// Manejo de errores globales del proceso (debe ir antes de app.listen)
process.on('uncaughtException', (err) => {
  console.error(`[${new Date().toISOString()}] Uncaught Exception:`, err);
  // Opcional: notificar por email/log externo antes de salir
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${new Date().toISOString()}] Unhandled Rejection:`, reason);
  // Opcional: notificar por email/log externo antes de salir
  process.exit(1);
});

// Validar variables de entorno críticas en producción
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET no está definido o es demasiado corto.');
  }
}

// Limitación de velocidad (Rate limiting)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limitar cada IP a 100 requests por ventana de tiempo
  message: 'Demasiadas peticiones desde esta IP, intente de nuevo más tarde.'
});
app.use('/api/', limiter);

// Limitación más estricta para endpoints de autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // limitar cada IP a 10 requests por ventana para auth
  message: 'Demasiados intentos de autenticación, intente de nuevo más tarde.'
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

// Static files for attachments
const uploadPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}
app.use('/static', express.static(uploadPath));

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/currencies', currencyRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/email', emailRoutes);

// Endpoint de verificación de salud
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    app: 'Gastos Robert'
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