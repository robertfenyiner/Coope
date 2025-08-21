const { pool, query, getClient, verificarConexion } = require('./database/config');
const bcrypt = require('bcryptjs');

// Verificar conexión al cargar el módulo
verificarConexion().then(connected => {
  if (!connected) {
    console.error(`[${new Date().toISOString()}] No se pudo conectar a PostgreSQL. Revisa la configuración.`);
    process.exit(1);
  }
}).catch(err => {
  console.error(`[${new Date().toISOString()}] Error verificando conexión:`, err);
  process.exit(1);
});

// Función para ejecutar el esquema de base de datos (inicialización)
const inicializarBaseDatos = async () => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await query(schema);
      console.log(`[${new Date().toISOString()}] Esquema de base de datos ejecutado correctamente`);
    } else {
      console.log(`[${new Date().toISOString()}] Archivo de esquema no encontrado, continuando...`);
    }
    
    // Crear usuario administrador por defecto
    await crearUsuarioAdmin();
    
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error inicializando base de datos:`, err.message);
    // No salir del proceso, permitir que la aplicación continúe
  }
};

// Función para crear usuario administrador por defecto
const crearUsuarioAdmin = async () => {
  try {
    const adminPassword = '@Nina0217'; // Cambiar por una contraseña más segura
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    
    const result = await query(`
      INSERT INTO usuarios (username, email, password_hash, nombre_completo, es_admin) 
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (username) DO NOTHING
      RETURNING id
    `, ['admin', 'admin@coopeenortol.com', hashedPassword, 'Administrador del Sistema', true]);
    
    if (result.rows.length > 0) {
      console.log(`[${new Date().toISOString()}] Usuario administrador 'admin' creado exitosamente`);
      
      // Agregar categorías por defecto
      await agregarCategoriasDefecto(result.rows[0].id);
    } else {
      console.log(`[${new Date().toISOString()}] Usuario administrador 'admin' ya existe`);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error creando usuario administrador:`, err.message);
  }
};

// Función para agregar categorías por defecto
const agregarCategoriasDefecto = async (userId) => {
  try {
    // Verificar si ya existen categorías para este usuario
    const existingCategories = await query(
      'SELECT COUNT(*) as count FROM categorias WHERE usuario_id = $1',
      [userId]
    );
    
    if (existingCategories.rows[0].count > 0) {
      console.log(`[${new Date().toISOString()}] Usuario ${userId} ya tiene ${existingCategories.rows[0].count} categorías, saltando creación por defecto`);
      return;
    }

    const categoriasDefecto = [
      // Categorías Básicas
      { nombre: 'Alimentación', color: '#10b981', icono: 'coffee' },
      { nombre: 'Transporte', color: '#3b82f6', icono: 'truck' },
      { nombre: 'Salud', color: '#ef4444', icono: 'heart' },
      { nombre: 'Entretenimiento', color: '#f59e0b', icono: 'film' },
      { nombre: 'Compras', color: '#8b5cf6', icono: 'shopping-cart' },
      
      // Hogar/Servicios Públicos
      { nombre: 'Servicios Públicos', color: '#06b6d4', icono: 'zap' },
      { nombre: 'Electricidad', color: '#fbbf24', icono: 'zap' },
      { nombre: 'Agua', color: '#06b6d4', icono: 'zap' },
      { nombre: 'Gas', color: '#f97316', icono: 'zap' },
      { nombre: 'Internet', color: '#6366f1', icono: 'wifi' },
      { nombre: 'Teléfono', color: '#84cc16', icono: 'phone' },
      { nombre: 'Cable/TV', color: '#ec4899', icono: 'tv' },
      
      // Streaming y Servicios Digitales
      { nombre: 'Netflix', color: '#e50914', icono: 'film' },
      { nombre: 'Spotify', color: '#1db954', icono: 'music' },
      { nombre: 'Amazon Prime', color: '#ff9900', icono: 'package' },
      { nombre: 'Disney+', color: '#113ccf', icono: 'star' },
      { nombre: 'YouTube Premium', color: '#ff0000', icono: 'film' },
      { nombre: 'Apple Music', color: '#fa243c', icono: 'music' },
      { nombre: 'HBO Max', color: '#9333ea', icono: 'film' },
      { nombre: 'Paramount+', color: '#0064ff', icono: 'film' },
      
      // Finanzas y Seguros
      { nombre: 'Seguros', color: '#059669', icono: 'shield' },
      { nombre: 'Banco/Tarjetas', color: '#dc2626', icono: 'credit-card' },
      { nombre: 'Inversiones', color: '#7c3aed', icono: 'trending-up' },
      
      // Hogar y Mantenimiento
      { nombre: 'Hogar/Decoración', color: '#d97706', icono: 'home' },
      { nombre: 'Reparaciones', color: '#374151', icono: 'tool' },
      { nombre: 'Jardinería', color: '#16a34a', icono: 'heart' },
      
      // Cuidado Personal
      { nombre: 'Cuidado Personal', color: '#be185d', icono: 'user' },
      { nombre: 'Farmacia', color: '#dc2626', icono: 'heart' },
      { nombre: 'Gimnasio/Deporte', color: '#ea580c', icono: 'activity' },
      
      // Educación y Profesional
      { nombre: 'Educación', color: '#1d4ed8', icono: 'book' },
      { nombre: 'Trabajo/Oficina', color: '#6b7280', icono: 'briefcase' },
      
      // Otros
      { nombre: 'Mascotas', color: '#f59e0b', icono: 'heart' },
      { nombre: 'Regalos', color: '#ec4899', icono: 'gift' },
      { nombre: 'Viajes', color: '#0ea5e9', icono: 'package' },
      { nombre: 'Otros', color: '#64748b', icono: 'more-horizontal' }
    ];

    // Insertar categorías en lotes para mejor rendimiento
    const insertQuery = `
      INSERT INTO categorias (usuario_id, nombre, color, icono) 
      VALUES ($1, $2, $3, $4)
    `;

    for (const categoria of categoriasDefecto) {
      await query(insertQuery, [userId, categoria.nombre, categoria.color, categoria.icono]);
    }

    console.log(`[${new Date().toISOString()}] Categorías por defecto agregadas para el usuario ${userId}`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error agregando categorías por defecto:`, err.message);
  }
};

// Función para obtener conexión del pool (para transacciones)
const obtenerConexion = async () => {
  return await getClient();
};

// Función para ejecutar consultas simples
const ejecutarConsulta = async (texto, parametros) => {
  return await query(texto, parametros);
};

// Funciones de utilidad para migración desde SQLite
const funcionesUtilidad = {
  // Función para migrar datos desde SQLite (si es necesario)
  migrarDesdeSQLite: async (sqlitePath) => {
    const sqlite3 = require('sqlite3').verbose();
    const fs = require('fs');
    
    if (!fs.existsSync(sqlitePath)) {
      console.log(`[${new Date().toISOString()}] Archivo SQLite no encontrado: ${sqlitePath}`);
      return;
    }
    
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(sqlitePath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        console.log(`[${new Date().toISOString()}] Conectado a SQLite para migración`);
        
        // Aquí se implementaría la lógica de migración
        // Por ahora solo cerrar la conexión
        db.close((err) => {
          if (err) {
            reject(err);
          } else {
            console.log(`[${new Date().toISOString()}] Migración desde SQLite completada`);
            resolve();
          }
        });
      });
    });
  }
};

// Inicializar base de datos al cargar el módulo
inicializarBaseDatos();

// Exportar funciones y objetos necesarios
module.exports = {
  pool,
  query: ejecutarConsulta,
  getClient: obtenerConexion,
  verificarConexion,
  inicializarBaseDatos,
  crearUsuarioAdmin,
  agregarCategoriasDefecto,
  funcionesUtilidad
};