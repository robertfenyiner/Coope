const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuración de la base de datos PostgreSQL
const dbConfig = {
  user: process.env.DB_USER || 'coopeenortol_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'coopeenortol_db',
  password: process.env.DB_PASSWORD || 'Coope2024!',
  port: process.env.DB_PORT || 5432,
  // Configuración del pool de conexiones para manejar múltiples usuarios concurrentes
  max: process.env.DB_MAX_CONNECTIONS || 50, // Máximo 50 conexiones concurrentes
  idleTimeoutMillis: 30000, // Cerrar conexiones inactivas después de 30 segundos
  connectionTimeoutMillis: 5000, // Timeout de conexión de 5 segundos
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Crear pool de conexiones
const pool = new Pool(dbConfig);

// Manejo de errores del pool
pool.on('error', (err) => {
  console.error(`[${new Date().toISOString()}] Error inesperado en el pool de base de datos:`, err.message);
});

// Función para verificar la conexión
const verificarConexion = async () => {
  // Si la base de datos está deshabilitada, simular conexión exitosa
  if (process.env.DB_HOST === undefined || process.env.DISABLE_DATABASE === 'true') {
    console.log(`[${new Date().toISOString()}] ⚠️  Base de datos deshabilitada para desarrollo local`);
    return false;
  }
  
  try {
    const client = await pool.connect();
    console.log(`[${new Date().toISOString()}] ✅ Conexión exitosa a PostgreSQL - Base de datos: ${dbConfig.database}`);
    client.release();
    return true;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Error conectando a PostgreSQL:`, err.message);
    return false;
  }
};

// Función para ejecutar queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] Query ejecutado`, { text: text.substring(0, 100), duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error en query:`, err.message);
    throw err;
  }
};

// Función para obtener un cliente del pool (para transacciones)
const getClient = async () => {
  return await pool.connect();
};

module.exports = {
  pool,
  query,
  getClient,
  verificarConexion
};